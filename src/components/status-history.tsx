import { formatDateAr, publicStatusMeta, validationStatusMeta } from "@/lib/reports/format";
import type { ReportWithReporter } from "@/lib/reports/types";
import { CheckCircle2, Clock3, Send } from "lucide-react";

export function StatusHistory({ report }: { report: ReportWithReporter }) {
  if (report.status_history?.length) {
    return (
      <ol className="space-y-4">
        {report.status_history.map((event) => (
          <li key={event.id} className="flex gap-3">
            <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-civic-yellow text-charcoal-950">
              <Clock3 className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-bold text-charcoal-950">{localizeEvent(event.event)}</p>
              {event.note ? <p className="mt-1 text-sm leading-6 text-stone-600">{event.note}</p> : null}
              <p className="mt-1 text-sm text-stone-500">{formatDateAr(event.created_at)}</p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  const events = [
    {
      label: "تم استلام البلاغ من تيليجرام",
      date: report.created_at,
      icon: Send
    },
    {
      label: `نتيجة مراجعة الذكاء الاصطناعي: ${validationStatusMeta[report.ai_validation_status].label}`,
      date: report.updated_at,
      icon: Clock3
    },
    {
      label: `الحالة العامة الحالية: ${publicStatusMeta[report.public_status].label}`,
      date: report.updated_at,
      icon: CheckCircle2
    }
  ];

  return (
    <ol className="space-y-4">
      {events.map((event) => (
        <li key={event.label} className="flex gap-3">
          <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-civic-yellow text-charcoal-950">
            <event.icon className="size-4" aria-hidden="true" />
          </div>
          <div>
            <p className="font-bold text-charcoal-950">{event.label}</p>
            <p className="mt-1 text-sm text-stone-500">{formatDateAr(event.date)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function localizeEvent(event: string) {
  const labels: Record<string, string> = {
    seed_imported: "تم إدخال البلاغ كبيانات تجريبية",
    telegram_report_created: "تم استلام البلاغ من تيليجرام",
    ai_review_completed: "اكتملت مراجعة الذكاء الاصطناعي",
    manual_status_updated: "تحديث إداري للحالة"
  };

  return labels[event] ?? event;
}
