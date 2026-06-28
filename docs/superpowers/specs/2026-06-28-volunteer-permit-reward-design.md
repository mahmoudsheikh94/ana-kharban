# أنا خربان — Volunteer + Permit + Reward + Transparency Design

## Goal

Extend the existing civic-reporting platform with five capabilities that turn approved
reports into fixed problems and reward the citizens who fix them:

1. **Volunteering via Telegram** — a citizen offers to fix an approved report.
2. **Permit flow** — each volunteer/report pairing is a permit the admin approves and
   tracks through `pending → approved → active → completed` (plus `rejected`/`cancelled`).
3. **Fix-content submission** — the volunteer submits proof of the fix (photo, description,
   GPS) via Telegram or a public upload endpoint.
4. **Points + leaderboard** — completing a fix awards points scored by severity and
   category; volunteers have a public profile and there is a leaderboard.
5. **Public transparency layer** — a no-login set of pages: map of approved reports,
   the volunteer leaderboard, and the published fix content.

## Constraints & existing patterns (must follow)

- **Stack**: Next.js 15 App Router, Supabase (`@supabase/supabase-js` with the
  `SUPABASE_SECRET_KEY` service-role key via `createSupabaseServerClient`), Tailwind,
  TypeScript, Zod. Arabic-first RTL UI with the `civic`/`charcoal` color tokens.
- **Data access**: all DB access goes through `src/lib/supabase/*` server-only helpers.
  Pages are `export const dynamic = "force-dynamic"` server components.
- **AI**: direct `fetch` to Gemini in `src/lib/ai/gemini.ts` (no Vercel AI SDK).
- **Telegram**: stateful conversation FSM in `src/lib/telegram/flow.ts`, orchestrated by
  `src/app/api/telegram/webhook/route.ts`. State persisted in `telegram_conversations`.
  Identity is the Telegram `user_id` (already the `reporters` key).
- **Auth**: password cookie + `src/middleware.ts` protects admin routes. RLS is enabled
  on every table but no anon SELECT policies exist yet — the service-role key bypasses RLS,
  which is how reads work today.
- **Migrations**: timestamped SQL in `supabase/migrations`, `create ... if not exists`,
  `enable row level security` on every new table, reuse `public.set_updated_at()` trigger.

## Architecture decisions (made autonomously)

### Data model — new tables

- **`volunteers`** — one row per Telegram user who has volunteered at least once.
  `id`, `telegram_user_id` (unique, links to the same id space as `reporters`),
  `display_name`, `phone_number`, `total_points int default 0`, `completed_fixes int
  default 0`, `created_at`. `total_points`/`completed_fixes` are denormalized counters
  updated when a fix is completed (cheap leaderboard reads, no aggregation on every page).

- **`permits`** — the volunteer⇄report assignment + lifecycle.
  `id`, `report_id` (FK), `volunteer_id` (FK), `status` check
  `('pending','approved','active','completed','rejected','cancelled')`,
  `points_awarded int`, `admin_note`, `requested_at`, `approved_at`, `completed_at`,
  `created_at`, `updated_at`. Unique partial index on `(report_id)` where status is in
  the live set so a report can only have one active permit at a time. `set_updated_at`
  trigger.

- **`fix_submissions`** — proof of the fix attached to a permit.
  `id`, `permit_id` (FK), `report_id` (FK, denormalized for public queries),
  `image_url`, `description`, `latitude`, `longitude`, `source` check
  `('telegram','upload')`, `created_at`. A permit can have multiple submissions
  (e.g. before/after); the public layer shows the latest.

- **`points_ledger`** — append-only audit of every points change.
  `id`, `volunteer_id`, `permit_id`, `points`, `reason`, `created_at`.

All four get RLS enabled. Public read access is granted via **narrow SELECT policies to the
`anon` role** scoped to published rows only (see RLS section) — this is the first time the
project exposes anon reads, done deliberately for the transparency layer so the public
pages can use the publishable key and never need the service key.

### Points scoring

Pure function `scoreFix(severity, category)` in `src/lib/rewards/scoring.ts`:
base points by severity (`low 10, medium 20, high 35, urgent 50`) × a category multiplier
(default 1.0, higher for hazard categories). Fully unit-tested. Points are computed and
frozen onto the permit (`points_awarded`) at completion so later scoring-table changes
don't retroactively alter history.

### Permit lifecycle

`pending` (volunteer requested) → admin `approved` → admin marks `active` (work started)
→ volunteer submits fix + admin marks `completed` (awards points, bumps the report's
`public_status` to `fixed`, increments volunteer counters, writes a ledger row, writes a
`report_status_history` row). Admin can `reject` a pending permit or `cancel` a live one.
A guard prevents requesting a permit for a report that isn't `approved`, and prevents a
second live permit on the same report.

### Telegram flow extension

Two new top-level commands handled in the webhook *before* the report-intake FSM, so they
don't disturb the existing intake states:

- `/fix <report_id>` — register/identify the volunteer and create a `pending` permit for an
  approved report. Replies with the permit id and next steps. Reuses the rate-limit and
  blocked-user guards already in the webhook.
- `/submit <permit_id>` — enters a small dedicated sub-flow (`awaiting_fix_photo` →
  `awaiting_fix_location` → optional `awaiting_fix_description`) that collects fix content
  and creates a `fix_submissions` row, then notifies the citizen flow is awaiting admin
  completion. These new states are added to the `telegram_conversations` state check and to
  the `ConversationState` union, kept isolated in a new `src/lib/telegram/volunteer-flow.ts`
  so `flow.ts` stays focused on report intake.

### Public upload endpoint

`POST /api/fix/submit` (route handler, `force-dynamic`, Node runtime) accepts a multipart
form: `permit_id`, image file, `description`, `latitude`, `longitude`. Zod-validates,
checks the permit exists and is `approved`/`active`, uploads the image to the existing
`report-images` bucket under `fixes/<permit_id>/...`, inserts a `fix_submissions` row. No
auth (public submission) but guarded by permit-existence + status + image size/mime checks.
Returns JSON. A minimal public form page at `/public/submit/[permitId]` posts to it.

### Public transparency layer (no login)

New route group `src/app/(public)/public/*`, explicitly **excluded** from the admin
middleware matcher (admin `/map` stays admin-only; the public map lives at `/public/map`):

- `/public` — landing: stats + links.
- `/public/map` — Leaflet map of approved reports (reuses the existing map components,
  reads via anon-safe public helpers).
- `/public/leaderboard` — ranked volunteers by points.
- `/public/volunteers/[id]` — a volunteer's public profile + their completed fixes.
- `/public/fixes` — gallery of published fix content (before/after).

Public pages read through a new `src/lib/supabase/public.ts` using the **publishable** key
(anon) so RLS actually governs what's exposed, proving the anon policies are correct.
A separate public layout (no admin shell, simple header/nav).

### Admin permit UI

- New nav item "التصاريح" (Permits) → `/permits` list (filter by status) and
  `/permits/[id]` detail with approve/reject/activate/complete/cancel server actions and
  the attached fix submissions. Permit management helpers in
  `src/lib/supabase/permits.ts`; server actions in `src/app/permits/*/actions.ts`.
  Added to the middleware matcher and `AppShell` nav.

### RLS policy strategy

- New tables keep RLS enabled; the **service-role key bypasses RLS** so all admin/webhook
  writes and reads continue to work unchanged.
- Add explicit **`anon` SELECT policies** only for the transparency surface:
  - `volunteers`: anon may select all columns needed for the leaderboard/profile
    (no phone number exposure — phone is selected only by service role; the public helper
    never requests it).
  - `permits`: anon may select rows where `status = 'completed'`.
  - `fix_submissions`: anon may select all (they are intrinsically public proof).
  - `reports`: anon may select rows where `ai_validation_status = 'approved'` — needed for
    the public map. (Admin reads keep using the service key, so this narrow policy doesn't
    widen the admin surface.)
  - `report_status_history`, abuse/AI tables, `reporters`, conversations: **no anon policy**
    — stay service-role-only.

## Components & isolation

- `src/lib/rewards/scoring.ts` (+ test) — pure scoring, no deps.
- `src/lib/supabase/permits.ts` — permit/volunteer/fix write+read helpers (service key).
- `src/lib/supabase/public.ts` — anon-key public reads.
- `src/lib/telegram/volunteer-flow.ts` (+ test) — pure volunteer sub-flow FSM.
- `src/lib/permits/types.ts` — `Volunteer`, `Permit`, `FixSubmission`, status unions, meta.
- Admin: `src/app/permits/**`, nav + middleware updates.
- Public: `src/app/(public)/public/**`, `src/lib/supabase/public.ts`, public layout.
- API: `src/app/api/fix/submit/route.ts`.

## Error handling

- Permit transitions validate the current status server-side and throw on illegal moves;
  server actions surface a friendly Arabic message.
- Telegram volunteer commands reuse the webhook's try/catch + rate-limit/blocked guards and
  reply in Arabic on failure.
- Upload endpoint returns structured JSON errors (400 invalid, 404 permit, 413 too large).
- Points awarding is idempotent: completing an already-completed permit is a no-op (guarded
  by status check) so a double-click can't double-award.

## Testing

- Unit: `scoring.ts`, `volunteer-flow.ts`, and a permit-transition validator
  (`src/lib/permits/transitions.ts`) following the existing `__tests__` + vitest pattern.
- `npm run verify` (lint + typecheck + vitest + build) must pass at the end.

## Out of scope

- Real auth for volunteers (identity is the Telegram user id; public upload is open).
- Notifications back to volunteers beyond Telegram replies.
- Editing/deleting fix submissions from the UI.
