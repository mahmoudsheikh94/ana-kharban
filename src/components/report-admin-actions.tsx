import type { ReportWithReporter } from "@/lib/reports/types";
import { Save } from "lucide-react";
import { updateReportStatusAction } from "@/app/reports/[id]/actions";

export function ReportAdminActions({ report }: { report: ReportWithReporter }) {
  return (
    <form action={updateReportStatusAction} className="space-y-4">
      <input type="hidden" name="reportId" value={report.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-xs font-bold text-stone-600">نتيجة التحقق</span>
          <select
            name="validationStatus"
            defaultValue={report.ai_validation_status}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            <option value="approved">معتمد</option>
            <option value="rejected">مرفوض</option>
            <option value="needs_more_info">بحاجة لمعلومات</option>
            <option value="pending">بانتظار المراجعة</option>
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-xs font-bold text-stone-600">الحالة العامة</span>
          <select
            name="publicStatus"
            defaultValue={report.public_status}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            <option value="new">جديد</option>
            <option value="sent">تم الإرسال</option>
            <option value="acknowledged">تم الاستلام</option>
            <option value="fixed">تم الإصلاح</option>
            <option value="ignored">تم التجاهل</option>
          </select>
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-bold text-stone-600">ملاحظة إدارية</span>
        <textarea
          name="note"
          rows={3}
          placeholder="اكتب سبب التغيير أو إجراء المتابعة..."
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
        />
      </label>

      <button className="inline-flex items-center gap-2 rounded-md bg-charcoal-900 px-4 py-2 text-sm font-bold text-white hover:bg-charcoal-800">
        <Save className="size-4" aria-hidden="true" />
        حفظ التحديث
      </button>
    </form>
  );
}
