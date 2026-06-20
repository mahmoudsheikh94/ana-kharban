import { severityMeta } from "@/lib/reports/format";
import type { Severity } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

export function SeverityBadge({ severity }: { severity: Severity | null }) {
  if (!severity) {
    return <span className="text-sm text-stone-400">غير مصنفة</span>;
  }

  const meta = severityMeta[severity];

  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1", meta.className)}>
      {meta.label}
    </span>
  );
}
