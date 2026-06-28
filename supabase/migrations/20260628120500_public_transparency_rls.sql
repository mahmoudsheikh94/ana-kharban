-- Public (anon) read access for the transparency layer.
-- The service-role key still bypasses RLS for all admin/webhook reads and writes.
-- These policies expose ONLY published/approved rows to the anon role.

-- Approved reports power the public map.
drop policy if exists "public_read_approved_reports" on public.reports;
create policy "public_read_approved_reports"
  on public.reports
  for select
  to anon
  using (ai_validation_status = 'approved');

-- Volunteers are visible for the leaderboard and public profiles.
-- NOTE: this row policy exposes rows; column exposure is narrowed to safe columns by
-- migration 20260628123000 (column-level GRANTs hide phone_number / telegram_user_id).
drop policy if exists "public_read_volunteers" on public.volunteers;
create policy "public_read_volunteers"
  on public.volunteers
  for select
  to anon
  using (true);

-- Only completed permits are public.
drop policy if exists "public_read_completed_permits" on public.permits;
create policy "public_read_completed_permits"
  on public.permits
  for select
  to anon
  using (status = 'completed');

-- Fix submissions are public proof of work, but ONLY once their permit is completed
-- (admin-approved). Migration 20260628123000 replaces this broad policy with a
-- permit-status-gated one. Kept here for historical accuracy of the migration timeline.
drop policy if exists "public_read_fix_submissions" on public.fix_submissions;
create policy "public_read_fix_submissions"
  on public.fix_submissions
  for select
  to anon
  using (true);
