-- Idempotency: make points award and fix submission impossible to double-apply.

-- 1) One points award per permit, ever. A double-fired completion (admin double-click or
--    webhook replay) inserts a second ledger row -> 23505, which the app treats as
--    "already awarded". This is the load-bearing guarantee for ledger/leaderboard integrity.
--    NOTE: only one non-null permit_id row may exist per permit; rows with null permit_id
--    (e.g. manual adjustments) are unaffected because the index is partial.
create unique index if not exists points_ledger_permit_uniq
  on public.points_ledger (permit_id)
  where permit_id is not null;

-- 2) One proof image per permit. A double-clicked web upload or a Telegram replay cannot
--    insert a duplicate fix_submissions row for the same (permit, image).
create unique index if not exists fix_submissions_permit_image_uniq
  on public.fix_submissions (permit_id, image_url);

-- 3) Atomic reward application. Inserts the ledger row AND bumps the volunteer counters in
--    a SINGLE transaction, keyed on permit_id. This makes the award crash-safe, not just
--    race-safe: the ledger row and the counter increment commit together or not at all, so
--    a retry after a mid-completion failure can repair the counter (the unique permit_id
--    index makes the insert idempotent). Returns true when it actually awarded, false when
--    this permit was already awarded (so the caller can still finish non-reward steps).
create or replace function public.award_fix_points(
  p_volunteer_id uuid,
  p_permit_id uuid,
  p_points integer,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- One award per permit: ON CONFLICT makes a replay a no-op without erroring. The conflict
  -- target matches the partial unique index points_ledger_permit_uniq (where permit_id is
  -- not null); this RPC is always called with a non-null permit_id.
  insert into public.points_ledger (volunteer_id, permit_id, points, reason)
  values (p_volunteer_id, p_permit_id, p_points, p_reason)
  on conflict (permit_id) where permit_id is not null do nothing;

  if not found then
    return false; -- already awarded for this permit
  end if;

  update public.volunteers
  set total_points = total_points + p_points,
      completed_fixes = completed_fixes + 1,
      updated_at = now()
  where id = p_volunteer_id;

  return true;
end;
$$;
