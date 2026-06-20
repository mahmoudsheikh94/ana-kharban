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

A Telegram bot API key is not needed for this dashboard MVP. It will be needed later only if this repo adds a Telegram webhook or ingestion service. For now, the dashboard reads reports already stored in Supabase.

## Verification

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```
