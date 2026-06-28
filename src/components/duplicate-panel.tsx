import { clearDuplicateAction, confirmDuplicateAction } from "@/app/reports/[id]/actions";
import { shortId } from "@/lib/reports/format";
import type { Report } from "@/lib/reports/types";

// Shown on the report detail page when duplicate detection flagged a suggestion, or when an
// admin has already confirmed a duplicate link. Lets the admin confirm or dismiss.
export function DuplicatePanel({ report }: { report: Report }) {
  if (report.duplicate_of) {
    return (
      <div className="rounded-md bg-stone-100 p-4 ring-1 ring-stone-300">
        <p className="text-sm text-charcoal-900">
          هذا البلاغ مُؤكَّد كتكرار للبلاغ{" "}
          <a href={`/reports/${report.duplicate_of}`} className="font-bold text-civic-amber hover:underline">
            {shortId(report.duplicate_of)}
          </a>{" "}
          ولا يظهر في الواجهة العامة.
        </p>
        <form action={clearDuplicateAction} className="mt-3">
          <input type="hidden" name="reportId" value={report.id} />
          <button
            type="submit"
            className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-charcoal-900 ring-1 ring-stone-300 hover:bg-stone-50"
          >
            إلغاء الربط (ليس تكراراً)
          </button>
        </form>
      </div>
    );
  }

  if (report.possible_duplicate_of) {
    return (
      <div className="rounded-md bg-amber-50 p-4 ring-1 ring-amber-300">
        <p className="text-sm font-bold text-amber-900">⚠️ احتمال تكرار</p>
        <p className="mt-1 text-sm text-charcoal-900">
          يشبه هذا البلاغ بلاغاً قريباً بنفس التصنيف:{" "}
          <a
            href={`/reports/${report.possible_duplicate_of}`}
            className="font-bold text-civic-amber hover:underline"
          >
            {shortId(report.possible_duplicate_of)}
          </a>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={confirmDuplicateAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <input type="hidden" name="originalId" value={report.possible_duplicate_of} />
            <button
              type="submit"
              className="rounded-md bg-charcoal-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-charcoal-950"
            >
              تأكيد كتكرار
            </button>
          </form>
          <form action={clearDuplicateAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <button
              type="submit"
              className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-charcoal-900 ring-1 ring-stone-300 hover:bg-stone-50"
            >
              ليس تكراراً
            </button>
          </form>
        </div>
      </div>
    );
  }

  return null;
}
