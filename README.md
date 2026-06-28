# أنا خربان

MVP admin dashboard for civic reports submitted through a Telegram bot. Citizens report public issues in Jordan with identity, phone, Telegram ID, photo, and GPS location. Gemini analyzes the report, then the citizen confirms the AI result or adds a short correction. The dashboard lets an admin inspect, filter, and visualize the reports stored in Supabase.

Citizens can also **volunteer to fix** an approved report. Volunteering issues an internal **permit** (managed by the admin), the volunteer submits **fix proof** (photo + description + optional GPS) through the same bot or a public upload page, and completing a fix awards **points**. A login-free **public transparency layer** shows approved reports on a map, a volunteer leaderboard, and the submitted fixes for public accountability.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Supabase Storage bucket: `report-images`
- Leaflet / OpenStreetMap

## Environment

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
ADMIN_DASHBOARD_PASSWORD=
SUPABASE_STORAGE_BUCKET=report-images
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
GEMINI_API_KEY=
APP_BASE_URL=
AI_DAILY_USER_LIMIT=3
AI_DAILY_GLOBAL_LIMIT=100
REPORTS_WEEKLY_USER_LIMIT=10
TELEGRAM_MAX_INVALID_ATTEMPTS=3
TELEGRAM_MAX_IMAGE_BYTES=6291456
```

`SUPABASE_SECRET_KEY` is used only by server-side dashboard queries. Do not expose it with a `NEXT_PUBLIC_` prefix.

## Database

The schema lives in:

```bash
supabase/migrations/20260620115202_initial_schema.sql
```

Seed data lives in:

```bash
supabase/seed.sql
```

Apply to a linked Supabase project:

```bash
supabase link --project-ref <project-ref> --password "$SUPABASE_DB_PASSWORD"
supabase db push --password "$SUPABASE_DB_PASSWORD"
supabase db query --linked -f supabase/seed.sql
```

The migrations create:

- `reporters`
- `reports`
- `report_votes`
- `volunteers`, `permits`, `fix_submissions`, `points_ledger` (volunteer + permit + reward system)
- `report-images` storage bucket (report photos under `telegram/...`, fix proof under `fixes/...`)
- indexes and `updated_at` triggers
- a partial unique index allowing only one live permit per report
- RLS enabled on all public tables, with narrow anon (publishable-key) SELECT policies
  for the public transparency layer

Volunteer / permit / reward migrations:

```bash
supabase/migrations/20260628120000_volunteer_permit_reward.sql
supabase/migrations/20260628120500_public_transparency_rls.sql
supabase/migrations/20260628121000_telegram_volunteer_states.sql
supabase/migrations/20260628123000_public_transparency_hardening.sql
supabase/migrations/20260628130000_telegram_update_dedup.sql
supabase/migrations/20260628130500_idempotency_hardening.sql
supabase/migrations/20260628131000_report_duplicate_detection.sql
```

> These migrations must be applied (`supabase db push`) before the volunteer,
> permit, reward, and public pages work. The public layer reads with the
> publishable (anon) key, so RLS governs what is exposed: only approved,
> non-duplicate reports, safe volunteer columns (never phone number or Telegram
> ID), and fix submissions whose permit is completed.
>
> The last three migrations harden idempotency and add duplicate detection:
> a `telegram_processed_updates` table (dedupe redelivered webhook updates), a
> unique `points_ledger(permit_id)` index + `increment_volunteer_rewards` RPC
> (no double points), a unique `fix_submissions(permit_id, image_url)` index (no
> duplicate proof), and `reports.possible_duplicate_of` / `duplicate_of` columns.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000/login
```

Log in with `ADMIN_DASHBOARD_PASSWORD`.

## Pages

Admin (cookie-protected):

- `/dashboard`: summary metrics and recent reports
- `/reports`: filterable report table
- `/reports/[id]`: full report details
- `/map`: approved reports on a Leaflet map (service-role read)
- `/permits`: permit queue, filterable by status
- `/permits/[id]`: permit detail with volunteer info, submitted fix proof, and the
  approve / activate / complete / reject / cancel actions

Public (no login, outside the auth middleware):

- `/public`: public landing with platform stats
- `/public/map`: approved reports on a Leaflet map (anon read)
- `/public/leaderboard`: top volunteers by points
- `/public/volunteers/[id]`: a volunteer's public profile and completed fixes
- `/public/fixes`: gallery of completed fix submissions
- `/public/submit/[permitId]`: login-free fix-proof upload form for a permit

## Telegram Bot

The app includes a Telegram webhook at:

```text
/api/telegram/webhook
```

The bot flow collects:

1. full name
2. phone number
3. photo
4. GPS location

- downloads the Telegram photo
- uploads it to Supabase Storage
- upserts the reporter
- creates the report
- runs Gemini image/location analysis
- updates AI fields on the report
- records status history
- replies to the citizen with the tracking ID and AI analysis
- asks the citizen to confirm the analysis or reject it and write a correction

If the citizen rejects the AI analysis, the bot asks for a short description, updates the existing report, re-runs Gemini with that description, and stores the corrected result.

The volunteer flow is **button-driven** (Telegram inline keyboards): citizens never
type a command or paste a permit ID. Slash commands remain as fallbacks.

Citizen commands (fallbacks; buttons are the primary path):

```text
/start
/cancel
/status <report-id>
/fix <report-id>       volunteer to fix an approved report (issues a pending permit)
/submit [permit-id]    start fix-proof submission; with no id, resolves your active permit
/mypermits             list your permits and resume an active one (alias: /myfixes)
```

## Volunteer, Permit & Reward Flow

1. A citizen finds an approved report on the public map (`/public/map`) and taps its
   "تطوّع لإصلاح هذا البلاغ" button (which opens the bot at `?start=fix_<report-id>`).
   The bot shows the report and a **«نعم، أتطوّع»** confirm button — no UUID is shown.
2. Confirming upserts a `volunteers` row (seeded from the citizen's existing reporter
   name/phone, so a returning user is never re-asked for identity) and creates a
   `pending` permit. Only one live permit exists per report; an already-`fixed` report
   cannot be re-volunteered.
3. The admin reviews the permit at `/permits/[id]` and moves it `approved` → `active`.
   On activation the bot pushes the volunteer a **«📸 أرسل صور الإصلاح»** button (the
   permit ID rides in the button's callback data — never typed).
4. Tapping it walks photo → location → optional description (with a **«تخطّي الوصف»**
   button). Volunteers can also use the public `/public/submit/[permitId]` form (which
   posts to `POST /api/fix/submit`, validated with Zod and a magic-byte MIME check).
5. The admin reviews the proof and completes the permit. Completion is **idempotent,
   race-safe, and crash-safe** — a conditional status flip plus an `award_fix_points` RPC
   that inserts the ledger row and bumps `total_points` / `completed_fixes` in one
   transaction (keyed on a unique `points_ledger(permit_id)` index). Double-clicks, webhook
   replays, and retries after a mid-completion failure can never double-award or leave the
   counters short. It awards points and marks the report `fixed`.

All Telegram webhook updates are deduped by `update_id`, so a redelivered update never
re-runs any side effect.

Scoring (`src/lib/rewards/scoring.ts`): a severity base (`low` 10, `medium` 20,
`high` 35, `urgent` 50) scaled by a category multiplier (e.g. electrical 1.5,
water/sewage 1.4, roads 1.3, waste 1.1). Points are frozen onto the permit at completion.

## Duplicate-Report Detection

To stop the same physical issue being tracked twice, every new Telegram report is checked
at intake (after AI analysis) against existing live reports: a report within
`DUP_RADIUS_DEG` degrees (default `0.0009` ≈ 100m) **and** sharing the same `ai_category`
is flagged as a *possible duplicate* (`reports.possible_duplicate_of`). Nothing is
auto-rejected — an admin sees an "احتمال تكرار" panel on the report detail page and either
**confirms** it (links via `duplicate_of`, marks it `ignored`, and hides it from the public
map) or **dismisses** it. The match logic is a pure, unit-tested function
(`src/lib/reports/duplicates.ts`); the candidate query uses a bounding box + category.

Verify the bot token:

```bash
npm run telegram:get-me
```

Generate a strong webhook secret and put it in `TELEGRAM_WEBHOOK_SECRET`:

```bash
npm run telegram:generate-secret
```

Set the webhook after deploying the app to a public HTTPS URL:

```bash
APP_BASE_URL=https://your-deployed-app.example.com npm run telegram:set-webhook
```

Telegram will send the configured `TELEGRAM_WEBHOOK_SECRET` in the `X-Telegram-Bot-Api-Secret-Token` header. The route rejects requests without the matching header.

## AI Review

Gemini analysis uses the server-only `GEMINI_API_KEY`. The model receives the uploaded issue image, inferred Jordan city/area, GPS coordinates, and optional citizen description. It returns structured JSON for:

- category
- severity
- confidence
- validation status
- validation reason
- image analysis
- generated Arabic complaint text

If Gemini is unavailable, the report is still created and marked `needs_more_info` for human review.

## Admin Actions

Report detail pages include an admin form to:

- override AI validation status
- update public status
- add an administrative note

Each update writes to `report_status_history`.

## Production Hardening

Already implemented:

- server-only Supabase secret key usage
- Telegram webhook secret validation
- Telegram webhook rate limiting per Telegram user ID
- Telegram abuse controls before Gemini calls
- per-user and global Gemini daily limits
- weekly report limits, duplicate report checks, Jordan GPS checks, and one re-analysis per report
- admin abuse dashboard with block/unblock controls
- basic security headers from Next.js
- RLS enabled on public tables
- report images stored in Supabase Storage
- no service/secret keys exposed through `NEXT_PUBLIC_`
- generated and manual status history

Before public launch:

- rotate all keys that were shared during development
- deploy behind HTTPS
- set `APP_BASE_URL` and run `npm run telegram:set-webhook`
- replace the simple admin password with Supabase Auth or another real admin auth provider
- publish privacy/consent text for storing name, phone, Telegram ID, photo, and GPS
- monitor Supabase Storage usage and Gemini costs
- set provider-level Google/Gemini billing alerts and quotas as a final backstop

## Verification

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Or run the full local verification gate:

```bash
npm run verify
```

Run production smoke E2E checks after deploy:

```bash
npm run e2e:prod
```

When switching between `npm run build` and local development, prefer:

```bash
npm run dev:clean
```

This avoids stale `.next` chunks from a previous build/dev process.
