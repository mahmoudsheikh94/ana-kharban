# أنا خربان

MVP admin dashboard for civic reports submitted through a Telegram bot. Citizens report public issues in Jordan with identity, phone, Telegram ID, photo, GPS location, and an optional description. The dashboard lets an admin inspect, filter, and visualize the reports stored in Supabase.

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

The migration creates:

- `reporters`
- `reports`
- `report_votes`
- `report-images` storage bucket
- indexes and an `updated_at` trigger
- RLS enabled on all public tables

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

- `/dashboard`: summary metrics and recent reports
- `/reports`: filterable report table
- `/reports/[id]`: full report details
- `/map`: approved reports on a Leaflet map

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
5. optional description

After the final step, the webhook:

- downloads the Telegram photo
- uploads it to Supabase Storage
- upserts the reporter
- creates the report
- runs Gemini image/location analysis
- updates AI fields on the report
- records status history
- replies to the citizen with the tracking ID

Citizen commands:

```text
/start
/cancel
/status <report-id>
```

Verify the bot token:

```bash
npm run telegram:get-me
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
- add rate limiting to `/api/telegram/webhook`
- add abuse/spam review for repeated Telegram IDs and phone numbers
- publish privacy/consent text for storing name, phone, Telegram ID, photo, and GPS
- monitor Supabase Storage usage and Gemini costs

## Verification

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```
