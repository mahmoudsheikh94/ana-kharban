"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

type SubmitState = "idle" | "submitting" | "success" | "error";

export function FixUploadForm({ permitId }: { permitId: string }) {
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState<string>("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    const form = new FormData(event.currentTarget);
    form.set("permit_id", permitId);

    try {
      const response = await fetch("/api/fix/submit", { method: "POST", body: form });
      const payload = (await response.json()) as { ok: boolean; error?: string };

      if (response.ok && payload.ok) {
        setState("success");
        setMessage("تم استلام تقديم الإصلاح بنجاح. شكراً لتطوعك.");
        event.currentTarget.reset();
      } else {
        setState("error");
        setMessage(payload.error ?? "تعذر إرسال التقديم. حاول مرة أخرى.");
      }
    } catch {
      setState("error");
      setMessage("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
        <p className="font-bold">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-stone-200 bg-white p-5">
      <p className="text-xs text-stone-500">
        رقم التصريح: <span className="font-mono">{permitId}</span>
      </p>

      <label className="block space-y-2">
        <span className="text-xs font-bold text-stone-600">صورة الإصلاح (JPG / PNG / WebP)</span>
        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          required
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-bold text-stone-600">وصف الإصلاح (اختياري)</span>
        <textarea
          name="description"
          rows={3}
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          placeholder="مثال: تم رصف الحفرة وإغلاقها."
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-xs font-bold text-stone-600">خط العرض (اختياري)</span>
          <input
            type="number"
            step="any"
            name="latitude"
            dir="ltr"
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-xs font-bold text-stone-600">خط الطول (اختياري)</span>
          <input
            type="number"
            step="any"
            name="longitude"
            dir="ltr"
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      {state === "error" ? <p className="text-sm font-semibold text-red-700">{message}</p> : null}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="inline-flex items-center gap-2 rounded-md bg-charcoal-900 px-4 py-2 text-sm font-bold text-white hover:bg-charcoal-800 disabled:opacity-60"
      >
        <Upload className="size-4" aria-hidden="true" />
        {state === "submitting" ? "جارٍ الإرسال..." : "إرسال التقديم"}
      </button>
    </form>
  );
}
