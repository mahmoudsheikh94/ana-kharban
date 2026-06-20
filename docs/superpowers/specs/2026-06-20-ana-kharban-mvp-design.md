# أنا خربان MVP Design

## Goal

Build a real MVP admin dashboard for the civic reporting project `أنا خربان`. The dashboard reads reports submitted through a Telegram bot into Supabase, lets an admin inspect and manage reports, and visualizes approved reports on a map.

## Scope

The MVP includes:

- Next.js App Router application using TypeScript and Tailwind CSS.
- Password-protected admin dashboard using `ADMIN_DASHBOARD_PASSWORD`.
- Supabase PostgreSQL migration for `reporters`, `reports`, and `report_votes`.
- Seed data with realistic Jordan reports.
- Dashboard homepage summary metrics.
- Filterable reports table.
- Report details page with image, reporter data, GPS link, AI output, generated Arabic complaint, and status history display.
- Leaflet/OpenStreetMap map page showing approved reports with severity-colored pins.
- README and environment examples.

The MVP does not include:

- Telegram webhook ingestion.
- Multi-user authentication or roles.
- Public citizen-facing pages.
- AI image processing pipeline.
- Editing records from the dashboard beyond display-ready structure.

These can be added later without changing the core database shape.

## Architecture

Use Next.js App Router with a server-first data layer. Route handlers and server components read Supabase using the publishable key, relying on RLS policies designed for admin/password-gated dashboard access in the MVP. Client components are used only where browser APIs are required, mainly the Leaflet map and interactive filters.

The app structure will separate:

- `src/lib/supabase`: Supabase client creation and typed query helpers.
- `src/lib/reports`: report-specific formatting, filters, metrics, and seed-friendly domain helpers.
- `src/components`: reusable shell, cards, tables, badges, filters, and detail sections.
- `src/app`: route-specific pages and server actions.
- `supabase/migrations`: schema SQL.
- `supabase/seed.sql`: sample data.

## Security

Secrets are stored only in `.env.local`, which is ignored by git. Browser code may read only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Secret keys and database passwords are not imported into client components.

The admin protection is intentionally simple for MVP: a password form sets an HTTP-only cookie after comparing against `ADMIN_DASHBOARD_PASSWORD` on the server. Dashboard routes check this cookie before rendering. The design leaves room to replace the password gate with Supabase Auth later.

Tables in the public schema will have RLS enabled. Initial policies will allow read access through the publishable key for the dashboard MVP while keeping writes constrained to seed/server-side operations. Service role keys are not needed in frontend code.

## Data Model

`reporters` stores citizen identity from Telegram:

- `id uuid primary key`
- `telegram_user_id text unique`
- `full_name text not null`
- `phone_number text not null`
- `created_at timestamptz default now()`

`reports` stores each issue report and AI outputs:

- `id uuid primary key`
- `reporter_id uuid references reporters(id)`
- `image_url text not null`
- `latitude numeric not null`
- `longitude numeric not null`
- `area text`
- `city text`
- `user_description text`
- `ai_category text`
- `ai_severity text`
- `ai_confidence numeric`
- `ai_validation_status text check in ('approved','rejected','needs_more_info','pending')`
- `ai_validation_reason text`
- `ai_image_analysis text`
- `generated_complaint_arabic text`
- `public_status text check in ('new','sent','acknowledged','fixed','ignored')`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

`report_votes` stores citizen follow-up votes:

- `id uuid primary key`
- `report_id uuid references reports(id)`
- `telegram_user_id text`
- `vote text check in ('still_there','fixed','fake')`
- `created_at timestamptz default now()`

The migration will also create an `updated_at` trigger for `reports`.

## UI Direction

The interface is RTL-first, civic, dense, and trustworthy. It should feel like an operational dashboard for a Jordanian civic team, not a marketing page.

Visual system:

- Dark charcoal navigation and top chrome.
- Warm yellow for primary attention and active navigation.
- White and soft gray content surfaces.
- Muted red for urgent or rejected items.
- Green for approved/fixed states.
- Arabic labels throughout.

Primary routes:

- `/login`: minimal password screen.
- `/dashboard`: summary cards, recent reports, status/severity breakdowns.
- `/reports`: filterable reports table with query-string filters.
- `/reports/[id]`: report detail page.
- `/map`: Leaflet map with approved reports only.

## Data Flow

The dashboard reads records from Supabase through focused server query helpers. Filters from `/reports` are represented as URL search params so filtered views can be shared and refreshed. The details page fetches one report and its reporter by ID. The map page fetches only approved reports with valid coordinates.

If Supabase environment variables are missing or queries fail, pages show explicit empty/error states instead of crashing.

## Testing and Verification

The implementation should include unit tests for report formatting, metrics aggregation, and filter query parsing. Build verification must include:

- TypeScript check.
- Lint.
- Unit tests.
- Next.js production build.

After the app runs, inspect the main routes in browser screenshots to verify RTL layout, text fit, navigation, table usability, and nonblank map rendering.
