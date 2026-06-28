import { permitStatusMeta, type PermitStatus } from "@/lib/permits/types";
import { cn } from "@/lib/utils";

export function PermitStatusBadge({ status }: { status: PermitStatus }) {
  const meta = permitStatusMeta[status];

  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1", meta.className)}>
      {meta.label}
    </span>
  );
}
