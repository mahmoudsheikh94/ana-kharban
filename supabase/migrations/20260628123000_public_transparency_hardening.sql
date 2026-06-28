-- Hardens the public (anon) transparency layer.
--
-- The earlier 20260628120500 migration granted anon `using (true)` SELECT on the full
-- `volunteers` and `fix_submissions` tables. Row-level policies do NOT restrict columns,
-- so that left two gaps when reading with the publishable (anon) key:
--   1. anon could `select phone_number, telegram_user_id from volunteers` (PII leak).
--   2. anon could read fix submissions whose permit was not yet admin-completed
--      (fixes are meant to be public proof only after the admin completes the permit).
--
-- This migration:
--   * restricts anon column access on `volunteers` to safe columns only, via column-level
--     privileges (a row policy alone cannot hide columns);
--   * narrows the `fix_submissions` anon policy to rows whose permit is `completed`.
-- The service-role key still bypasses RLS for all admin/webhook reads and writes.

-- 1) Volunteers: keep row access open to anon, but hide PII columns.
-- With RLS enabled, anon needs BOTH a permitting row policy AND column privileges. By
-- revoking blanket SELECT and granting only the safe columns, anon can never read
-- phone_number or telegram_user_id even with a hand-written query.
revoke select on public.volunteers from anon;
grant select (id, display_name, total_points, completed_fixes, created_at)
  on public.volunteers to anon;

-- (The "public_read_volunteers" row policy from 20260628120500 with `using (true)` stays
--  in place; combined with the column grant above it now exposes only safe columns.)

-- 2) Fix submissions: only expose proof tied to a completed (admin-approved) permit.
drop policy if exists "public_read_fix_submissions" on public.fix_submissions;
create policy "public_read_completed_fix_submissions"
  on public.fix_submissions
  for select
  to anon
  using (
    exists (
      select 1
      from public.permits p
      where p.id = fix_submissions.permit_id
        and p.status = 'completed'
    )
  );
