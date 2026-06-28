-- Cross-user duplicate-report detection.
--
-- When a new report is geographically close to AND shares the ai_category of an existing
-- live report, it is flagged as a *possible* duplicate for an admin to confirm. Confirmed
-- duplicates are linked via duplicate_of and hidden from the public layer. Nothing is
-- auto-rejected; a human always decides.

alter table public.reports
  add column if not exists possible_duplicate_of uuid references public.reports(id) on delete set null,
  add column if not exists duplicate_of uuid references public.reports(id) on delete set null,
  add column if not exists dup_checked_at timestamptz;

-- Supports the proximity + category candidate lookup at intake.
create index if not exists reports_dup_lookup_idx
  on public.reports (ai_category, latitude, longitude);

create index if not exists reports_duplicate_of_idx on public.reports (duplicate_of);

-- Public map/feed must show one entry per real issue: hide confirmed duplicates.
-- Replaces the approved-only anon policy with approved AND not-a-confirmed-duplicate.
drop policy if exists "public_read_approved_reports" on public.reports;
create policy "public_read_approved_reports"
  on public.reports
  for select
  to anon
  using (ai_validation_status = 'approved' and duplicate_of is null);
