# Telegram Abuse Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Telegram users from abusing the bot or creating runaway Gemini costs while preserving the normal civic-report flow.

**Architecture:** Add server-side guardrails before every Gemini call. Store blocklist, abuse events, and AI usage events in Supabase, then expose a small admin page to review suspicious users and block/unblock them.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase/Postgres, Telegram webhook, Gemini API.

---

### Task 1: Pure Abuse Policy

**Files:**
- Create: `src/lib/abuse/policy.ts`
- Test: `src/lib/abuse/__tests__/policy.test.ts`

- [ ] Write tests for daily user AI limit, global AI limit, weekly report limit, duplicate file rejection, one reanalysis per report, and invalid-message warnings.
- [ ] Implement a pure `evaluateSubmissionGuard` and `recordInvalidAttempt` helper.
- [ ] Run focused tests.

### Task 2: Supabase Persistence

**Files:**
- Create migration: `supabase/migrations/<timestamp>_telegram_abuse_controls.sql`
- Modify: `src/lib/supabase/ingestion.ts`

- [ ] Add `telegram_blocked_users`, `telegram_abuse_events`, and `ai_usage_events`.
- [ ] Add server helpers for loading guard context, recording events, recording AI usage, blocking, and unblocking.
- [ ] Apply migration and verify with SQL.

### Task 3: Webhook Enforcement

**Files:**
- Modify: `src/app/api/telegram/webhook/route.ts`
- Modify: `src/lib/supabase/config.ts`
- Test: `src/lib/telegram/__tests__/flow.test.ts`

- [ ] Enforce blocklist and invalid input limits before normal flow work.
- [ ] Enforce GPS-inside-Jordan, duplicate file, weekly report, daily user AI, global AI, and one reanalysis limits before Gemini.
- [ ] If AI quota is exhausted, create the report with `needs_more_info` and skip Gemini.
- [ ] Record AI usage only when Gemini is called.

### Task 4: Admin Visibility

**Files:**
- Create: `src/app/abuse/page.tsx`
- Create: `src/app/abuse/actions.ts`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/lib/supabase/reports.ts` or create `src/lib/supabase/abuse.ts`

- [ ] Add an abuse page with suspicious users, counters, recent events, block/unblock actions.
- [ ] Protect the page with the existing admin middleware.

### Task 5: Verification and Deploy

- [ ] Run `npm run verify`.
- [ ] Push migration to Supabase.
- [ ] Commit and push to `main`.
- [ ] Deploy production.
- [ ] Run `npm run e2e:prod`.
