export type Severity = "low" | "medium" | "high" | "urgent";
export type ValidationStatus = "approved" | "rejected" | "needs_more_info" | "pending";
export type PublicStatus = "new" | "sent" | "acknowledged" | "fixed" | "ignored";

export type Reporter = {
  id: string;
  telegram_user_id: string | null;
  full_name: string;
  phone_number: string;
  created_at: string;
};

export type Report = {
  id: string;
  reporter_id: string | null;
  image_url: string;
  latitude: number;
  longitude: number;
  area: string | null;
  city: string | null;
  user_description: string | null;
  ai_category: string | null;
  ai_severity: Severity | null;
  ai_confidence: number | null;
  ai_validation_status: ValidationStatus;
  ai_validation_reason: string | null;
  ai_image_analysis: string | null;
  generated_complaint_arabic: string | null;
  public_status: PublicStatus;
  telegram_chat_id: string | null;
  telegram_message_id: number | null;
  telegram_file_id: string | null;
  source: "telegram" | "seed" | "admin";
  ai_reviewed_at: string | null;
  manual_reviewed_at: string | null;
  manual_review_note: string | null;
  possible_duplicate_of: string | null;
  duplicate_of: string | null;
  dup_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportStatusHistory = {
  id: string;
  report_id: string;
  actor: "telegram_bot" | "ai" | "admin" | "system";
  event: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
};

export type ReportWithReporter = Report & {
  reporter: Reporter | null;
  status_history?: ReportStatusHistory[];
};

export type ReportFilters = {
  status?: ValidationStatus;
  severity?: Severity;
  category?: string;
  city?: string;
  area?: string;
  from?: string;
  to?: string;
};

export type DashboardMetrics = {
  totalReports: number;
  approvedReports: number;
  rejectedReports: number;
  pendingAiReview: number;
  highSeverityReports: number;
  reportsToday: number;
};
