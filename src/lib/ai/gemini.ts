import "server-only";

import { getGeminiApiKey } from "@/lib/supabase/config";

export type AiReportAnalysis = {
  category: string;
  severity: "low" | "medium" | "high" | "urgent";
  confidence: number;
  validationStatus: "approved" | "rejected" | "needs_more_info" | "pending";
  validationReason: string;
  imageAnalysis: string;
  generatedComplaintArabic: string;
};

const fallbackAnalysis: AiReportAnalysis = {
  category: "غير مصنف",
  severity: "medium",
  confidence: 0.35,
  validationStatus: "needs_more_info",
  validationReason: "تعذر إكمال تحليل الذكاء الاصطناعي تلقائياً. يحتاج البلاغ إلى مراجعة بشرية.",
  imageAnalysis: "لم يتم تحليل الصورة بسبب خطأ في خدمة الذكاء الاصطناعي.",
  generatedComplaintArabic: "نرجو مراجعة البلاغ يدوياً والتحقق من الصورة والموقع قبل إرساله للجهة المختصة."
};

function buildPrompt(input: {
  city: string | null;
  area: string | null;
  latitude: number;
  longitude: number;
  userDescription: string | null;
}) {
  return `
أنت مساعد مراجعة بلاغات مدنية في الأردن لمنصة اسمها "أنا خربان".
حلل صورة البلاغ ومعلومات الموقع والوصف، ثم أعد JSON فقط.

الموقع:
- المدينة المتوقعة: ${input.city ?? "غير محددة"}
- المنطقة المتوقعة: ${input.area ?? "غير محددة"}
- GPS: ${input.latitude}, ${input.longitude}

وصف المواطن:
${input.userDescription ?? "لا يوجد وصف"}

القواعد:
- صنف المشكلة العامة بشكل مختصر بالعربية.
- severity يجب أن تكون واحدة من: low, medium, high, urgent.
- validationStatus يجب أن تكون واحدة من: approved, rejected, needs_more_info, pending.
- approved فقط إذا كانت الصورة تبدو مرتبطة بمشكلة عامة قابلة للإرسال.
- rejected إذا كانت الصورة لا تبدو مشكلة عامة أو تبدو مزيفة/غير مناسبة.
- needs_more_info إذا الصورة أو الموقع غير كافيين.
- اكتب complaint Arabic بصيغة رسمية موجهة للبلدية أو الجهة المختصة.
`;
}

function normalizeAnalysis(value: Partial<AiReportAnalysis>): AiReportAnalysis {
  const severityValues = new Set(["low", "medium", "high", "urgent"]);
  const statusValues = new Set(["approved", "rejected", "needs_more_info", "pending"]);

  return {
    category: typeof value.category === "string" && value.category ? value.category : fallbackAnalysis.category,
    severity: severityValues.has(String(value.severity))
      ? (value.severity as AiReportAnalysis["severity"])
      : fallbackAnalysis.severity,
    confidence:
      typeof value.confidence === "number" && value.confidence >= 0 && value.confidence <= 1
        ? value.confidence
        : fallbackAnalysis.confidence,
    validationStatus: statusValues.has(String(value.validationStatus))
      ? (value.validationStatus as AiReportAnalysis["validationStatus"])
      : fallbackAnalysis.validationStatus,
    validationReason:
      typeof value.validationReason === "string" && value.validationReason
        ? value.validationReason
        : fallbackAnalysis.validationReason,
    imageAnalysis:
      typeof value.imageAnalysis === "string" && value.imageAnalysis
        ? value.imageAnalysis
        : fallbackAnalysis.imageAnalysis,
    generatedComplaintArabic:
      typeof value.generatedComplaintArabic === "string" && value.generatedComplaintArabic
        ? value.generatedComplaintArabic
        : fallbackAnalysis.generatedComplaintArabic
  };
}

export async function analyzeReportWithGemini(input: {
  imageBytes: Buffer;
  mimeType: string;
  city: string | null;
  area: string | null;
  latitude: number;
  longitude: number;
  userDescription: string | null;
}) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${getGeminiApiKey()}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: buildPrompt(input) },
                {
                  inlineData: {
                    mimeType: input.mimeType,
                    data: input.imageBytes.toString("base64")
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                category: { type: "string" },
                severity: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                confidence: { type: "number" },
                validationStatus: {
                  type: "string",
                  enum: ["approved", "rejected", "needs_more_info", "pending"]
                },
                validationReason: { type: "string" },
                imageAnalysis: { type: "string" },
                generatedComplaintArabic: { type: "string" }
              },
              required: [
                "category",
                "severity",
                "confidence",
                "validationStatus",
                "validationReason",
                "imageAnalysis",
                "generatedComplaintArabic"
              ]
            }
          }
        })
      }
    );

    if (!response.ok) {
      return fallbackAnalysis;
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;

    if (!text) {
      return fallbackAnalysis;
    }

    return normalizeAnalysis(JSON.parse(text) as Partial<AiReportAnalysis>);
  } catch {
    return fallbackAnalysis;
  }
}
