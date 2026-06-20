import { publicStatusMeta, validationStatusMeta } from "@/lib/reports/format";
import type { PublicStatus, ValidationStatus } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

export function ValidationStatusBadge({ status }: { status: ValidationStatus }) {
  const meta = validationStatusMeta[status];

  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1", meta.className)}>
      {meta.label}
    </span>
  );
}

export function PublicStatusBadge({ status }: { status: PublicStatus }) {
  const meta = publicStatusMeta[status];

  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1", meta.className)}>
      {meta.label}
    </span>
  );
}
