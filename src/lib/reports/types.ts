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
  created_at: string;
  updated_at: string;
};

export type ReportWithReporter = Report & {
  reporter: Reporter | null;
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
