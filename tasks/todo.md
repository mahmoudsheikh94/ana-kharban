# Volunteer + Permit + Reward + Transparency — TODO

Spec: `docs/superpowers/specs/2026-06-28-volunteer-permit-reward-design.md`

## 1. Database
- [x] Migration: `volunteers`, `permits`, `fix_submissions`, `points_ledger` tables + RLS enabled + indexes + triggers
- [x] Migration: anon SELECT RLS policies for transparency (volunteers, completed permits, fix_submissions, approved reports)
- [x] Add new telegram conversation states for the volunteer submit sub-flow

## 2. Domain logic (pure, tested)
- [x] `src/lib/permits/types.ts` — types + status meta
- [x] `src/lib/rewards/scoring.ts` (+ test) — scoreFix(severity, category)
- [x] `src/lib/permits/transitions.ts` (+ test) — legal status transitions
- [x] `src/lib/telegram/volunteer-flow.ts` (+ test) — /fix and /submit sub-flow FSM

## 3. Data access helpers
- [x] `src/lib/supabase/permits.ts` — service-key permit/volunteer/fix helpers
- [x] `src/lib/supabase/public.ts` — anon-key public reads

## 4. Telegram integration
- [x] Wire `/fix` and `/submit` commands into the webhook route

## 5. Public upload endpoint
- [x] `src/app/api/fix/submit/route.ts` — multipart upload + Zod validation
- [x] `src/app/(public)/public/submit/[permitId]/page.tsx` — minimal public form

## 6. Admin permit UI
- [x] `src/app/permits/page.tsx` — list + filter
- [x] `src/app/permits/[id]/page.tsx` + actions — lifecycle controls + fix submissions
- [x] Add Permits to AppShell nav + middleware matcher

## 7. Public transparency layer (no login)
- [x] Public layout + `/public` landing
- [x] `/public/map`, `/public/leaderboard`, `/public/volunteers/[id]`, `/public/fixes`
- [x] Exclude `/public/*` from admin middleware (route group `(public)`, not in matcher)

## 8. Verify
- [x] `npm run verify` passes (lint + typecheck + test + build) — 42 tests pass, build green

## Review

**Completed in 10m 16s** (gut estimate ~90m). All 5 features implemented following the
existing codebase patterns (service-role Supabase client, server-only data helpers,
force-dynamic server components, Arabic RTL UI, custom cookie auth, pure tested FSMs).

### What was built
- **3 migrations**: schema (`volunteers`/`permits`/`fix_submissions`/`points_ledger` with
  RLS, indexes, a partial unique index for one-live-permit-per-report, `updated_at`
  triggers), anon-read RLS policies for the transparency layer, and new Telegram FSM states.
- **Pure domain logic** (15 new unit tests): `scoring.ts` (severity×category points),
  `transitions.ts` (permit lifecycle guard), `volunteer-flow.ts` (the /submit sub-flow FSM).
- **Data layer**: `permits.ts` (service-key writes + idempotent `completePermit` that awards
  points, bumps counters, writes a ledger row, marks the report fixed) and `public.ts`
  (anon-key reads governed by RLS — never selects volunteer phone numbers).
- **Telegram**: `/fix <reportId>` creates a pending permit; `/submit <permitId>` runs the
  photo→location→description sub-flow and stores a fix submission. Reuses existing
  rate-limit/blocked-user guards.
- **Public upload**: `POST /api/fix/submit` (Zod + magic-byte mime detection + size/status
  guards) and a client upload form at `/public/submit/[permitId]`.
- **Admin UI**: `/permits` list (status filter) + `/permits/[id]` detail with
  approve/activate/reject/cancel/complete actions and the attached fix submissions. Added
  to nav + middleware.
- **Public transparency**: `(public)` route group (no admin shell, outside middleware) with
  landing, map, leaderboard, volunteer profile, and fixes gallery.

### Architecture decisions (made autonomously)
- Reused the report-intake patterns rather than introducing Auth.js / Vercel AI SDK /
  Cache Components / proxy.ts — kept on Next.js 15.1 idioms. Skill hooks suggested those;
  declined as out-of-scope for this stack.
- Points frozen onto the permit at completion (`points_awarded`) so scoring-table changes
  don't rewrite history; `completePermit` is idempotent to prevent double-awards.
- Transparency layer reads with the **anon** key so RLS truly governs exposure; admin/map
  at `/map` stays service-role + admin-only (public map is a separate `/public/map`).

### Follow-ups / deploy notes
- The 3 migrations are written but **not yet applied** to the live database — run them via
  the Supabase CLI/dashboard before the features work in production.
- Volunteer identity is the Telegram user id (no separate volunteer auth, by design).
  The public upload endpoint is intentionally open (guarded by permit existence + status +
  image checks), since volunteers may not have Telegram on the device they fix from.
