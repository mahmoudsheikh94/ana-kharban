import { getAbuseLimits } from "@/lib/supabase/config";
import { enforceFixUploadRateLimit, uploadFixImage } from "@/lib/supabase/ingestion";
import {
  checkFixProximity,
  countFixSubmissions,
  createFixSubmission,
  getPermitForSubmission
} from "@/lib/supabase/permits";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Hard cap on proofs per permit, so a single permit can't be used to flood image storage.
const MAX_SUBMISSIONS_PER_PERMIT = 8;

// Best-effort client IP from the proxy headers Vercel/Next set. Falls back to a constant so a
// missing header degrades to a shared bucket (still rate-limited) rather than no limit at all.
function clientIpOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

const fieldsSchema = z.object({
  permit_id: z.string().uuid(),
  description: z.string().trim().max(1000).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional()
});

const supportedMimes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

// Detect the real image type from magic bytes so a renamed file can't smuggle past us.
function detectImageMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function POST(request: Request) {
  // IP rate limit first, before any parsing or storage work.
  const allowed = await enforceFixUploadRateLimit(clientIpOf(request));
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads. Try again later." },
      { status: 429 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid multipart form" }, { status: 400 });
  }

  const parsed = fieldsSchema.safeParse({
    permit_id: form.get("permit_id"),
    description: form.get("description") || undefined,
    latitude: form.get("latitude") || undefined,
    longitude: form.get("longitude") || undefined
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid fields", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing image file" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const limits = getAbuseLimits();

  if (bytes.byteLength === 0) {
    return NextResponse.json({ ok: false, error: "Empty image" }, { status: 400 });
  }

  if (bytes.byteLength > limits.maxImageBytes) {
    return NextResponse.json({ ok: false, error: "Image too large" }, { status: 413 });
  }

  const mime = detectImageMime(bytes);
  if (!mime) {
    return NextResponse.json({ ok: false, error: "Unsupported image type" }, { status: 400 });
  }

  const permit = await getPermitForSubmission(parsed.data.permit_id);
  if (!permit) {
    return NextResponse.json({ ok: false, error: "Permit not found" }, { status: 404 });
  }

  if (permit.status !== "approved" && permit.status !== "active") {
    return NextResponse.json(
      { ok: false, error: "Permit is not open for submissions" },
      { status: 409 }
    );
  }

  // Per-permit submission cap: stops one permit being used to flood storage.
  const existingCount = await countFixSubmissions(permit.id);
  if (existingCount >= MAX_SUBMISSIONS_PER_PERMIT) {
    return NextResponse.json(
      { ok: false, error: "Submission limit reached for this permit" },
      { status: 409 }
    );
  }

  // GPS proximity: a fix must be submitted near the report it claims to fix. Only enforced
  // when coordinates are provided; a missing location is allowed (admin still reviews).
  if (typeof parsed.data.latitude === "number" && typeof parsed.data.longitude === "number") {
    const proximity = await checkFixProximity(
      permit.report_id,
      parsed.data.latitude,
      parsed.data.longitude
    );
    if (!proximity.ok && proximity.reason === "too_far") {
      return NextResponse.json(
        {
          ok: false,
          error: "Fix location is too far from the report location",
          distanceMeters: Math.round(proximity.distanceMeters),
          toleranceMeters: proximity.toleranceMeters
        },
        { status: 422 }
      );
    }
  }

  try {
    const imageUrl = await uploadFixImage({
      permitId: permit.id,
      bytes,
      contentType: mime,
      extension: supportedMimes[mime]
    });

    const submissionId = await createFixSubmission({
      permitId: permit.id,
      reportId: permit.report_id,
      imageUrl,
      description: parsed.data.description ?? null,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      source: "upload"
    });

    return NextResponse.json({ ok: true, submissionId });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Failed to save submission" }, { status: 500 });
  }
}
