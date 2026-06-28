# Volunteer UX rework + idempotency hardening — Design

**Date:** 2026-06-28
**Status:** Approved (pending spec review)
**Round:** 2 (builds on `2026-06-28-volunteer-permit-reward-design.md`)

## Goal

The volunteer-to-fix flow works end-to-end, but the Telegram UX is clunky
(slash commands + manual 36-char UUID copy-paste) and an audit found real
idempotency gaps. This round:

1. Replaces the command/UUID-driven volunteer flow with **inline-keyboard
   buttons** (Telegram `callback_query`) — no slashes, no visible UUIDs.
2. Closes the **idempotency gaps** with DB-enforced guarantees.
3. Light **public-side polish** surfaced by the audit.

Decisions (locked by the user):
- Re-volunteer: **blocked once the report is `fixed`**; a rejected/cancelled
  permit may be re-volunteered (the issue still exists).
- Points integrity: **DB-enforced** (atomic completion + unique ledger).
- Button scope: **full button-driven flow** + approval notification.

Out of scope this round: Telegram Mini App (fast-follow candidate), any
change to the original *report-intake* flow (only the *volunteer* flow).

---

## Part A — Idempotency hardening (correctness first)

Audit verdict: `has_real_gaps`. Profile creation is solid (unique + upsert).
Four gaps, fixed as follows.

### A1. Telegram `update_id` dedup (root multiplier)
**Problem:** The webhook discards `update.update_id` and does heavy async work
(image download, AI, DB writes) before returning 200, so Telegram redelivers
on any slow/non-2xx response — and every replay is fully reprocessed.

**Fix (migration + route):**
- New table `telegram_processed_updates (update_id bigint primary key,
  processed_at timestamptz default now())`, RLS enabled (no anon policy).
- `normalizeTelegramUpdate` carries `updateId` through for all input kinds
  (including the new `callback` kind).
- At the very top of the webhook POST (after secret check, before any work):
  `insert ... on conflict do nothing`; if the row already existed, return
  `{ ok: true }` 200 immediately. A tiny helper `claimTelegramUpdate(updateId)`
  in `ingestion.ts` returns `false` when already seen.
- A periodic cleanup is unnecessary at this scale; the table is tiny. (Note in
  README that it can be pruned.)

### A2. Atomic permit completion + double-points guard
**Problem:** `completePermit` reads status then writes unconditionally
(TOCTOU). Double-click / replay → two ledger rows, leaderboard diverges.

**Fix (migration + `permits.ts`):**
- `points_ledger` gets `unique (permit_id)` — one award per permit, ever. The
  duplicate award INSERT fails with `23505`, which `awardPoints` catches and
  treats as already-awarded.
- Permit completion UPDATE becomes **conditional**:
  `update permits set status='completed', ... where id=$1 and status=$2
   returning *`. Zero rows → lost the race → bail without side effects.
- Volunteer counters become **atomic increments** via a `SECURITY DEFINER`
  RPC `increment_volunteer_rewards(p_volunteer_id uuid, p_points int)` doing
  `update volunteers set total_points = total_points + p_points,
   completed_fixes = completed_fixes + 1, updated_at = now() where id = ...`.
  Replaces the read-modify-write. The RPC is the single source of counter
  truth, called only after the conditional permit UPDATE succeeds.

### A3. Fix-submission dedup
**Problem:** `fix_submissions` has no unique constraint; web double-click or
Telegram replay → duplicate proof rows inflating the public list.

**Fix (migration + `permits.ts`):**
- `unique (permit_id, image_url)` on `fix_submissions`. The same proof image
  for the same permit cannot be inserted twice. `createFixSubmission` catches
  `23505` and returns the existing row.
- (`update_id` dedup in A1 already prevents the Telegram-replay path; this is
  the DB backstop and covers the public-upload double-click path.)
- Web route `/api/fix/submit` also disables its submit button on click
  (client-side, defence-in-depth — the constraint is load-bearing).

### A4. Re-volunteer guard
**Problem:** The live-permit partial unique index excludes terminal states, so
a `fixed` report can be re-volunteered indefinitely.

**Fix (`permits.ts` `requestPermit`):**
- Extend the report lookup to select `public_status`; if `public_status =
  'fixed'`, return a new guard reason `report_already_fixed` (friendly Arabic
  message). Rejected/cancelled permits remain re-volunteerable by design.

---

## Part B — Inline-button volunteer UX

### B1. Transport layer (the missing capability)
- `types.ts`: add `callback` to `NormalizedTelegramInput`
  (`{ kind: 'callback'; data: string; callbackQueryId: string; messageId;
  chatId; telegramUserId; updateId }`) and thread `updateId` onto every kind.
- `update.ts`: parse `update.callback_query` →
  `{ kind: 'callback', data: cbq.data, callbackQueryId: cbq.id,
     messageId: cbq.message.message_id, chatId, telegramUserId: cbq.from.id }`.
- `api.ts`:
  - `sendTelegramMessage(chatId, text, opts?)` gains optional
    `replyMarkup?: InlineKeyboardMarkup`.
  - new `answerCallbackQuery(callbackQueryId, opts?)` — **always called** for
    every callback (removes the client spinner; Telegram requires it).
  - new `editMessageReplyMarkup(chatId, messageId, replyMarkup)` — used to
    strip buttons off a message after the action is taken (so a button can't
    be tapped twice; UX-level idempotency that complements the DB guards).

### B2. `callback_data` scheme (≤ 64 bytes — verified limit)
Short action prefixes keep us well under 64 bytes (UUID is 36):
- `vol:<reportId>` — confirm volunteering for a report (≤ 41 B)
- `sub:<permitId>` — begin fix submission for a permit (≤ 41 B)
- `skip` — skip the optional description (no id needed; from conversation state)
- `can` — cancel current volunteer/fix flow (state-derived)
- `mine` — show "my permits" list

Parsing is a tiny pure function `parseCallback(data)` in `volunteer-flow.ts`,
unit-tested.

### B3. The button-driven journey (replaces slashes + UUIDs)
1. **Discover** (unchanged): public map CTA deep-links `?start=fix_<reportId>`.
2. **Confirm volunteer:** bot shows the report summary + a single button
   **«نعم، أتطوّع لإصلاحها»** (`vol:<reportId>`) and **«إلغاء»** (`can`).
   Tapping it creates the permit (idempotent per A1/A4) and replies: "طلبك
   قيد المراجعة" — **no UUID shown**, buttons removed from the message.
3. **Approval notification (new):** when the admin **activates** the permit,
   the server action sends the volunteer a push: "تمت الموافقة! اضغط لإرسال
   صور الإصلاح" with a **«📸 أرسل صور الإصلاح»** button (`sub:<permitId>`).
   The permitId rides in `callback_data` — the user never sees or types it.
4. **Submit fix:** tapping the button sets FSM state `awaiting_fix_photo` for
   that permit → bot asks for photo → location → description (with a
   **«تخطّي الوصف»** `skip` button instead of the hidden `/skip` literal).
   On completion the fix row is saved (idempotent per A3), buttons stripped.
5. **My permits (new, replaces missing `/myfixes`):** a **«حالة بلاغاتي»**
   button (and `/mypermits` text fallback) lists the user's permits with their
   status and, for any `active` permit, an inline **«أرسل صور الإصلاح»** button
   — so a volunteer who lost the chat can always resume without an ID.

### B4. Backward-compatible text fallbacks
Keep `/fix`, `/submit`, `/status`, `/cancel` working (some users type), but
they are no longer the primary path and `/submit` learns a **zero-arg form**:
with no UUID it resolves the user's latest `active` permit. Missing-arg help no
longer prints a scary literal all-zeros UUID; it points to the button instead.

### B5. Copy fixes
- `/cancel` mid-fix says "الإصلاح" not "البلاغ" (state-aware wording).
- All UUIDs removed from user-facing prompts (kept only in final confirmations
  as tap-to-copy `<code>` for support/debugging).

### B6. Never re-ask name/phone for a returning Telegram user
**Principle:** a known `telegram_user_id` is never asked for identity again.
- The volunteer profile is already deduped per `telegram_user_id`
  (`upsert onConflict`, `permits.ts:67-95`).
- On the first volunteer action, **seed `display_name`/`phone_number` silently
  from the existing `reporters` row** via `getReporterByTelegramId`
  (`permits.ts:98-111`) — the common case, since volunteers discover reports as
  reporters. Result: tapping «نعم، أتطوّع» creates the permit with **zero
  identity questions**.
- Only if there is no reporter record AND no volunteer record yet, ask **once**
  for a display name, store it, and never ask again. Phone is optional and
  never re-requested.
- The webhook's volunteer path must call the seed helper before/at
  `upsertVolunteer` so the name is populated without prompting. (Verify the
  current path does this; wire it if it asks again.)

---

## Part D — Cross-user duplicate-report detection

**Goal:** stop the same physical issue from being tracked as two reports when
different citizens report it. Distinct from the existing same-user abuse guard
(`abuse/policy.ts` `duplicate_nearby_report`, which *rejects* a user's own
nearby re-submission within 24h). This is a **separate, cross-user, product**
check that **flags** — never auto-rejects.

### D1. Match logic (deterministic, no extra AI cost)
A new report is a *possible duplicate* of an existing report when ALL hold:
- **Proximity:** within a bounding box of `±DUP_RADIUS_DEG` (default `0.0009°`
  ≈ ~100m; reuses the existing bounding-box idiom from `ingestion.ts:478-481`,
  no haversine helper introduced). Radius is a tunable config.
- **Same issue type:** identical `ai_category` (case-insensitive trim).
- **Candidate pool:** existing reports with
  `ai_validation_status in ('approved','pending')` (i.e. live issues, not
  rejected/duplicate ones). Self is excluded.
- No time window — a pothole reported months apart is still the same pothole.

If multiple match, pick the **oldest** (the canonical original).

### D2. What happens (flag, keep both — human decides)
- Reports gain two columns: `duplicate_of uuid references reports(id)` (null
  unless an admin confirms) and `possible_duplicate_of uuid` (the detector's
  suggestion, null when none). A `dup_checked_at timestamptz` marks that
  detection ran.
- At intake, **after** AI analysis and **before** final citizen confirmation,
  the webhook runs `findPossibleDuplicate({reportId, latitude, longitude,
  aiCategory})` and, on a hit, sets `possible_duplicate_of` + a
  `report_status_history` event `possible_duplicate_detected`.
- **Runs only on the Telegram `create_and_analyze` intake path** (where new
  citizen reports with fresh GPS enter). The re-analysis path doesn't change
  location, so re-checking is pointless; seed/admin-sourced rows are trusted
  and skipped.
- The new report is still created normally (no auto-merge, no rejection).
- Admin dashboard:
  - Reports list shows a "احتمال تكرار / possible duplicate" badge when
    `possible_duplicate_of` is set.
  - Report detail shows a panel linking the suggested original (image + id +
    distance) with two server actions:
    **«تأكيد كتكرار»** (set `duplicate_of`, set `public_status='ignored'`, write
    history) and **«ليس تكراراً»** (clear `possible_duplicate_of`).
- Public layer: reports with a confirmed `duplicate_of` are **excluded** from
  the public map/feed (anon RLS gains `... and duplicate_of is null`), so the
  public sees one entry per real issue.

### D3. Idempotency / safety
- Detection is read-only + a single targeted UPDATE on the new report; safe
  under the `update_id` dedup (Part A1). Re-running is harmless (recomputes the
  same suggestion).
- Admin confirm/clear are simple status transitions writing history; the
  confirm action is naturally idempotent (setting `duplicate_of` twice is a
  no-op write).

### D4. Config
- `DUP_RADIUS_DEG` (default `0.0009`) via the config getters in
  `lib/supabase/config.ts`, documented in README + `.env.example`.

## Part C — Light public polish
- Public map CTA: confirm wording «تطوّع لإصلاح هذا البلاغ» and that the button
  only renders for `approved` reports (it does).
- Leaderboard/fixes empty states already exist; verify rank display.
- (No schema/route additions beyond Parts A/B.)

---

## Migrations (new)
1. `..._telegram_update_dedup.sql` — `telegram_processed_updates` + RLS.
2. `..._idempotency_hardening.sql` — `points_ledger unique(permit_id)`,
   `fix_submissions unique(permit_id, image_url)`,
   `increment_volunteer_rewards` RPC.
3. `..._report_duplicate_detection.sql` — `reports.duplicate_of`,
   `reports.possible_duplicate_of`, `reports.dup_checked_at`; index on
   `(ai_category, latitude, longitude)` to support the proximity+category
   lookup; update the anon public-reports RLS policy to add
   `and duplicate_of is null`.

(Re-volunteer guard A4 is code-only; no migration.)

## Testing
- Unit: `parseCallback`, the extended volunteer FSM transitions (callback
  inputs), `/submit` zero-arg resolution, re-volunteer guard reason.
- Unit: `findPossibleDuplicate` match logic (in/out of radius, category
  match/mismatch, self-exclusion, oldest-wins) — pure function over a fixture
  set so it needs no DB.
- Unit: volunteer identity seeding (returning user asked nothing; brand-new
  user asked once).
- Unit: scoring unchanged (already covered).
- `npm run verify` green (lint + typecheck + tests + build).
- Manual prod re-test of the full button flow + a deliberately-duplicated
  report to confirm the admin badge + exclusion from the public map.

## Risk / blast radius
- All transport changes are **additive** (`callback` is a new input kind; text
  flow untouched). Original report-intake flow is not modified.
- Idempotency migrations are additive constraints + one RPC; safe to apply
  because current data has no duplicates (verified: 0 volunteers/permits/fixes
  at design time, and the single live test permit is unique).
- `editMessageReplyMarkup`/`answerCallbackQuery` failures are non-fatal
  (wrapped, logged) — they never block the DB-side effect.
