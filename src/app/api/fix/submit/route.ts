import { getAbuseLimits } from "@/lib/supabase/config";
import { uploadFixImage } from "@/lib/supabase/ingestion";
import { createFixSubmission, getPermitForSubmission } from "@/lib/supabase/permits";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
