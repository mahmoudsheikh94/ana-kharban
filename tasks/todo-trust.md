# Trust & Motivation hardening — TODO

## 1. Volunteer names
- [ ] New conversation state `awaiting_volunteer_name`
- [ ] `requestVolunteerPermit`: if volunteer has no real name, ask for one, store pending reportId, then create permit
- [ ] Stop exposing raw Telegram ID publicly (neutral fallback)

## 2. Fix verification ("did a fix really happen")
- [ ] `lib/geo/distance.ts` (+test) — haversineMeters
- [ ] Telegram + upload: reject fix submission >150m from the report's GPS
- [ ] `completePermit`: block unless ≥1 fix_submission exists
- [ ] Admin permit detail: before (report) / after (fix) photos side-by-side

## 3. Points meaning — tiers
- [ ] `lib/rewards/tiers.ts` (+test) — cumulative points → Arabic rank + badge
- [ ] Show tier on leaderboard + volunteer profile

## 4. Upload endpoint hardening
- [ ] IP-based rate limit on POST /api/fix/submit
- [ ] Cap submissions per permit
- [ ] Tighten status guard

## Verify
- [x] npm run verify green — 70 tests / 14 files, lint + typecheck + build all pass
- [x] e2e re-check in browser — leaderboard shows real name + 🌱 tier; profile shows "50 نقطة للوصول…"; require-proof + GPS gates verified against live data

## Review

All four items shipped, deployed (3 migrations applied), and browser-verified:

1. **Volunteer names** — first-time volunteers with no name on file are asked for a display
   name (`awaiting_volunteer_name` state) before the permit is created; it's stored and shown
   on the leaderboard/profile. Volunteers who are already reporters keep their reporter name.
   The internal `متطوع <id>` placeholder is never shown publicly — the public read layer maps
   it to "متطوع مجهول".
2. **Fix verification** — three gates: (a) `haversineMeters`/`checkFixProximity` rejects a fix
   GPS >150m from the report (enforced in BOTH the upload route → 422 and the Telegram flow →
   re-ask location); (b) `completePermit` throws `PERMIT_NO_FIX_SUBMISSION` unless ≥1 proof
   exists, surfaced as an inline admin notice + disabled complete button; (c) the admin permit
   page shows report (before) / fix (after) photos side-by-side.
3. **Points tiers** — pure `lib/rewards/tiers.ts` (🌱 مبتدئ → ⭐ نشيط → 🏅 بطل الحي → 🏆 بطل
   المدينة → 👑 أسطورة) shown as a `TierBadge` on the leaderboard and profile, with a
   "X نقطة للترقية" hint via `nextTier`.
4. **Upload hardening** — IP rate-limit (10/10min, `fix_upload_rate_limits` table) → 429,
   per-permit cap of 8 submissions → 409, plus the proximity gate above.

New tests: tiers (4), distance/haversine (6). Total suite 70 passing.
The admin-bottleneck item was intentionally left as-is per your call.
