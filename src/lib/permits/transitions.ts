import type { PermitStatus } from "./types";

// Legal permit status transitions. Keys are the current status; values are the set of
// statuses an admin (or the system) may move to from there. Terminal states have none.
const allowedTransitions: Record<PermitStatus, PermitStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: []
};

export function canTransition(from: PermitStatus, to: PermitStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertTransition(from: PermitStatus, to: PermitStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal permit transition: ${from} -> ${to}`);
  }
}

export function nextStatuses(from: PermitStatus): PermitStatus[] {
  return [...allowedTransitions[from]];
}

export function isTerminal(status: PermitStatus): boolean {
  return allowedTransitions[status].length === 0;
}
