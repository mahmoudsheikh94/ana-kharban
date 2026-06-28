import type { BadgeMeta } from "@/lib/reports/format";
import type { Severity } from "@/lib/reports/types";

export type PermitStatus =
  | "pending"
  | "approved"
  | "active"
  | "completed"
  | "rejected"
  | "cancelled";

export type FixSource = "telegram" | "upload";

export type Volunteer = {
  id: string;
  telegram_user_id: string | null;
  display_name: string;
  phone_number: string | null;
  total_points: number;
  completed_fixes: number;
  created_at: string;
  updated_at: string;
};

export type PublicVolunteer = Omit<Volunteer, "phone_number" | "updated_at">;

export type Permit = {
  id: string;
  report_id: string;
  volunteer_id: string;
  status: PermitStatus;
  points_awarded: number;
  admin_note: string | null;
  requested_at: string;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FixSubmission = {
  id: string;
  permit_id: string;
  report_id: string;
  image_url: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  source: FixSource;
  created_at: string;
};

export const permitStatusMeta: Record<PermitStatus, BadgeMeta> = {
  pending: { label: "بانتظار الموافقة", className: "bg-stone-100 text-stone-700 ring-stone-200" },
  approved: { label: "تمت الموافقة", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  active: { label: "قيد التنفيذ", className: "bg-yellow-50 text-yellow-800 ring-yellow-200" },
  completed: { label: "مكتمل", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  rejected: { label: "مرفوض", className: "bg-red-50 text-red-700 ring-red-200" },
  cancelled: { label: "ملغي", className: "bg-stone-200 text-stone-700 ring-stone-300" }
};

export const permitStatusOptions: PermitStatus[] = [
  "pending",
  "approved",
  "active",
  "completed",
  "rejected",
  "cancelled"
];

// Statuses that count as "a report is currently being handled".
export const livePermitStatuses: PermitStatus[] = ["pending", "approved", "active"];

export type ScoringSeverity = Severity;
