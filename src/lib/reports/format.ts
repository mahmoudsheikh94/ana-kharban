import type { PublicStatus, Severity, ValidationStatus } from "./types";

export type BadgeMeta = {
  label: string;
  className: string;
};

export const severityMeta: Record<Severity, BadgeMeta> = {
  low: { label: "منخفضة", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  medium: { label: "متوسطة", className: "bg-yellow-50 text-yellow-800 ring-yellow-200" },
  high: { label: "عالية", className: "bg-orange-50 text-orange-800 ring-orange-200" },
  urgent: { label: "عاجلة", className: "bg-red-50 text-red-700 ring-red-200" }
};

export const validationStatusMeta: Record<ValidationStatus, BadgeMeta> = {
  approved: { label: "معتمد", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  rejected: { label: "مرفوض", className: "bg-red-50 text-red-700 ring-red-200" },
  needs_more_info: { label: "بحاجة لمعلومات", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  pending: { label: "بانتظار المراجعة", className: "bg-stone-100 text-stone-700 ring-stone-200" }
};

export const publicStatusMeta: Record<PublicStatus, BadgeMeta> = {
  new: { label: "جديد", className: "bg-stone-100 text-stone-700 ring-stone-200" },
  sent: { label: "تم الإرسال", className: "bg-yellow-50 text-yellow-800 ring-yellow-200" },
  acknowledged: { label: "تم الاستلام", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  fixed: { label: "تم الإصلاح", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  ignored: { label: "تم التجاهل", className: "bg-red-50 text-red-700 ring-red-200" }
};

export function formatDateAr(value: string | Date) {
  return new Intl.DateTimeFormat("ar-JO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDateOnly(value: string | Date) {
  return new Intl.DateTimeFormat("ar-JO", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

export function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "غير متوفر";
  }

  return `${Math.round(value * 100)}%`;
}

export function shortId(id: string) {
  return `#${id.slice(0, 8)}`;
}
