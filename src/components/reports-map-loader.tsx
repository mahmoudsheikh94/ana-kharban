"use client";

import type { ReportWithReporter } from "@/lib/reports/types";
import dynamic from "next/dynamic";

const ReportsMapClient = dynamic(() => import("./reports-map").then((module) => module.ReportsMap), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[620px] items-center justify-center rounded-lg border border-stone-200 bg-white text-sm font-bold text-stone-500">
      تحميل الخريطة...
    </div>
  )
});

export function ReportsMapLoader({
  reports,
  volunteerBotUsername
}: {
  reports: ReportWithReporter[];
  volunteerBotUsername?: string;
}) {
  return <ReportsMapClient reports={reports} volunteerBotUsername={volunteerBotUsername} />;
}
