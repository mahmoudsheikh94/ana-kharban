import type { ReportFilters, Severity, ValidationStatus } from "./types";

const statuses = new Set<ValidationStatus>(["approved", "rejected", "needs_more_info", "pending"]);
const severities = new Set<Severity>(["low", "medium", "high", "urgent"]);

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isIsoDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function parseReportFilters(searchParams: RawSearchParams): ReportFilters {
  const filters: ReportFilters = {};
  const status = firstValue(searchParams.status);
  const severity = firstValue(searchParams.severity);
  const category = firstValue(searchParams.category);
  const city = firstValue(searchParams.city);
  const area = firstValue(searchParams.area);
  const from = firstValue(searchParams.from);
  const to = firstValue(searchParams.to);

  if (statuses.has(status as ValidationStatus)) {
    filters.status = status as ValidationStatus;
  }

  if (severities.has(severity as Severity)) {
    filters.severity = severity as Severity;
  }

  if (category?.trim()) {
    filters.category = category.trim();
  }

  if (city?.trim()) {
    filters.city = city.trim();
  }

  if (area?.trim()) {
    filters.area = area.trim();
  }

  if (isIsoDate(from)) {
    filters.from = from;
  }

  if (isIsoDate(to)) {
    filters.to = to;
  }

  return filters;
}
