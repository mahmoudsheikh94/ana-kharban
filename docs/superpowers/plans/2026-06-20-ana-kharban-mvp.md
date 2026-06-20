# Ana Kharban MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete `أنا خربان` Next.js MVP dashboard with Supabase schema, seed data, password protection, report management, details, and map visualization.

**Architecture:** Use a Next.js App Router project with server-first Supabase reads and client components only for interactive filters and Leaflet. Keep database SQL, data access, domain helpers, UI primitives, and route pages separated so authentication and Telegram ingestion can be added later without rewriting dashboard views.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Supabase, PostgreSQL, Supabase Storage, Leaflet/OpenStreetMap, Vitest, Testing Library.

---

## File Structure

- `package.json`: scripts and dependencies.
- `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `tailwind.config.ts`, `eslint.config.mjs`, `vitest.config.ts`: project configuration.
- `src/app/layout.tsx`: root RTL layout and global metadata.
- `src/app/globals.css`: Tailwind theme variables and base styles.
- `src/app/login/page.tsx`, `src/app/login/actions.ts`: password login.
- `src/middleware.ts`: route protection for dashboard pages.
- `src/app/dashboard/page.tsx`: summary dashboard.
- `src/app/reports/page.tsx`: filterable reports table.
- `src/app/reports/[id]/page.tsx`: report detail page.
- `src/app/map/page.tsx`: approved reports map.
- `src/components/*`: reusable shell, cards, badges, filters, table, map, and detail components.
- `src/lib/supabase/*`: Supabase browser/server clients and query helpers.
- `src/lib/reports/*`: types, formatting, metric aggregation, filter parsing.
- `src/test/*`: test setup and sample fixtures.
- `supabase/migrations/20260620000000_initial_schema.sql`: schema migration.
- `supabase/seed.sql`: realistic sample data.
- `.env.example`: safe environment template.
- `README.md`: setup and run instructions.

### Task 1: Scaffold the Next.js Project

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`

- [ ] **Step 1: Create project configuration**

Add scripts for `dev`, `build`, `lint`, `typecheck`, and `test`. Use dependencies: `next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`, `leaflet`, `lucide-react`, `clsx`, `tailwind-merge`, `zod`, `date-fns`. Use dev dependencies for TypeScript, Tailwind, ESLint, Vitest, Testing Library, and jsdom.

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and dependencies install without errors.

- [ ] **Step 3: Create the RTL root layout and Tailwind globals**

Implement `src/app/layout.tsx` with `lang="ar"` and `dir="rtl"`. Implement `src/app/globals.css` with Tailwind layers, charcoal/yellow/red theme variables, map CSS import handling, and accessible focus styles.

- [ ] **Step 4: Verify scaffold**

Run: `npm run typecheck`

Expected: TypeScript exits 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs tailwind.config.ts eslint.config.mjs vitest.config.ts src/app/layout.tsx src/app/globals.css
git commit -m "chore: scaffold next dashboard"
```

### Task 2: Add Supabase Schema, Seed Data, and Environment Template

**Files:**
- Create: `supabase/migrations/20260620000000_initial_schema.sql`
- Create: `supabase/seed.sql`
- Create: `.env.example`

- [ ] **Step 1: Write the migration**

Create tables `reporters`, `reports`, and `report_votes` exactly as specified. Add `gen_random_uuid()` defaults, validation checks for AI status, severity, public status, and votes. Enable RLS on all tables. Add read policies for dashboard MVP reads through anon/authenticated roles. Add an `updated_at` trigger on `reports`.

- [ ] **Step 2: Write seed data**

Insert 8 reporters and 12 reports across Amman, Irbid, Zarqa, Salt, Karak, and Aqaba. Include mixed categories, severities, validation statuses, public statuses, AI confidence values, Arabic complaint text, and image URLs using stable Unsplash/source placeholder URLs or Supabase storage-style paths.

- [ ] **Step 3: Write environment example**

Include only safe names:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
ADMIN_DASHBOARD_PASSWORD=
SUPABASE_STORAGE_BUCKET=report-images
```

- [ ] **Step 4: Verify SQL syntax locally where available**

Run: `supabase --version || true`

If Supabase CLI is available, run: `supabase db reset --local`

If unavailable, continue with static review and document that local DB verification was not available.

- [ ] **Step 5: Commit**

Run:

```bash
git add supabase/migrations/20260620000000_initial_schema.sql supabase/seed.sql .env.example
git commit -m "feat: add supabase schema and seed data"
```

### Task 3: Add Domain Types, Formatting, Metrics, and Tests

**Files:**
- Create: `src/lib/reports/types.ts`
- Create: `src/lib/reports/format.ts`
- Create: `src/lib/reports/metrics.ts`
- Create: `src/lib/reports/filters.ts`
- Create: `src/lib/reports/__tests__/format.test.ts`
- Create: `src/lib/reports/__tests__/metrics.test.ts`
- Create: `src/lib/reports/__tests__/filters.test.ts`

- [ ] **Step 1: Write failing tests**

Test Arabic date formatting, severity/status label mapping, metric counts, reports-today calculation, and URL filter parsing.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/lib/reports`

Expected: tests fail because implementation files do not exist or functions are not implemented.

- [ ] **Step 3: Implement minimal report helpers**

Define report types matching the database shape. Implement `formatDateAr`, `formatPercent`, `severityMeta`, `validationStatusMeta`, `publicStatusMeta`, `calculateDashboardMetrics`, and `parseReportFilters`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- --run src/lib/reports`

Expected: report helper tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/reports
git commit -m "feat: add report domain helpers"
```

### Task 4: Add Supabase Clients and Query Layer

**Files:**
- Create: `src/lib/supabase/config.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/reports.ts`

- [ ] **Step 1: Write client config**

Validate `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` on the server. Return clear errors for missing values.

- [ ] **Step 2: Write server client**

Use `@supabase/ssr` to create a server client from Next cookies. Do not import secret keys.

- [ ] **Step 3: Write query helpers**

Implement `getReports`, `getReportById`, `getApprovedMapReports`, and `getDashboardData`. Keep all Supabase table names and selected columns explicit.

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`

Expected: exits 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/supabase
git commit -m "feat: add supabase report queries"
```

### Task 5: Add Password Protection

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/actions.ts`
- Create: `src/middleware.ts`
- Create: `src/lib/auth/admin.ts`

- [ ] **Step 1: Implement admin cookie helpers**

Use a signed-looking opaque value derived from the admin password with Web Crypto or Node crypto hash. Store it in an HTTP-only, same-site cookie. Keep comparison server-only.

- [ ] **Step 2: Implement login action and page**

Add a compact Arabic login screen for `أنا خربان`. On success, redirect to `/dashboard`; on failure, show a concise Arabic error.

- [ ] **Step 3: Protect routes**

Protect `/dashboard`, `/reports`, `/reports/:path*`, and `/map` in `src/middleware.ts`. Redirect unauthenticated requests to `/login`.

- [ ] **Step 4: Verify auth flow compiles**

Run: `npm run typecheck`

Expected: exits 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/app/login src/lib/auth src/middleware.ts
git commit -m "feat: add admin password gate"
```

### Task 6: Build Reusable UI Components

**Files:**
- Create: `src/lib/utils.ts`
- Create: `src/components/app-shell.tsx`
- Create: `src/components/stat-card.tsx`
- Create: `src/components/status-badge.tsx`
- Create: `src/components/severity-badge.tsx`
- Create: `src/components/empty-state.tsx`
- Create: `src/components/report-image.tsx`

- [ ] **Step 1: Add UI utilities**

Implement a `cn()` helper using `clsx` and `tailwind-merge`.

- [ ] **Step 2: Add app shell**

Implement RTL navigation with links to dashboard, reports, and map. Use `lucide-react` icons.

- [ ] **Step 3: Add cards and badges**

Implement summary cards and consistent severity/status badges from report metadata helpers.

- [ ] **Step 4: Verify components compile**

Run: `npm run typecheck`

Expected: exits 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/components src/lib/utils.ts
git commit -m "feat: add dashboard ui components"
```

### Task 7: Build Dashboard Homepage

**Files:**
- Create: `src/app/dashboard/page.tsx`
- Create: `src/components/recent-reports.tsx`
- Create: `src/components/report-breakdown.tsx`

- [ ] **Step 1: Fetch dashboard data server-side**

Call `getDashboardData()` from the page and calculate metrics using `calculateDashboardMetrics`.

- [ ] **Step 2: Render summary cards**

Show total, approved, rejected, pending AI review, high-severity, and reports today.

- [ ] **Step 3: Render recent reports and breakdowns**

Show latest reports and compact status/severity breakdown panels.

- [ ] **Step 4: Verify route compiles**

Run: `npm run typecheck`

Expected: exits 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/app/dashboard src/components/recent-reports.tsx src/components/report-breakdown.tsx
git commit -m "feat: build dashboard overview"
```

### Task 8: Build Reports Table and Filters

**Files:**
- Create: `src/app/reports/page.tsx`
- Create: `src/components/reports-table.tsx`
- Create: `src/components/reports-filters.tsx`

- [ ] **Step 1: Read filters from search params**

Parse `status`, `severity`, `category`, `area`, `city`, `from`, and `to`.

- [ ] **Step 2: Render filter controls**

Use native select/date inputs with RTL labels and GET form submission.

- [ ] **Step 3: Render table**

Show report ID, full name, phone, category, severity, status, area, created date, AI confidence, and details link.

- [ ] **Step 4: Verify route compiles**

Run: `npm run typecheck`

Expected: exits 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/app/reports/page.tsx src/components/reports-table.tsx src/components/reports-filters.tsx
git commit -m "feat: build reports table"
```

### Task 9: Build Report Details Page

**Files:**
- Create: `src/app/reports/[id]/page.tsx`
- Create: `src/components/report-detail-section.tsx`
- Create: `src/components/status-history.tsx`

- [ ] **Step 1: Fetch report by ID**

Call `getReportById(id)` and return `notFound()` when absent.

- [ ] **Step 2: Render details**

Show uploaded image, reporter full name, phone, Telegram user ID, GPS coordinates, Google Maps link, AI image analysis, validation result, validation reason, generated Arabic complaint text, public status, status history, created date, and updated date.

- [ ] **Step 3: Verify route compiles**

Run: `npm run typecheck`

Expected: exits 0.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/app/reports/[id]/page.tsx src/components/report-detail-section.tsx src/components/status-history.tsx
git commit -m "feat: build report details"
```

### Task 10: Build Map View

**Files:**
- Create: `src/app/map/page.tsx`
- Create: `src/components/reports-map.tsx`
- Create: `src/components/map-preview-card.tsx`

- [ ] **Step 1: Fetch approved map reports**

Call `getApprovedMapReports()` server-side and pass serializable data into a client map component.

- [ ] **Step 2: Implement Leaflet map**

Render OpenStreetMap tiles, severity-colored div icons, and a selected report preview popup/card with image, category, severity, area, status, and details link.

- [ ] **Step 3: Verify no SSR map crash**

Use dynamic import or client-only component boundaries so Leaflet does not access `window` during server render.

- [ ] **Step 4: Verify route compiles**

Run: `npm run typecheck`

Expected: exits 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/app/map/page.tsx src/components/reports-map.tsx src/components/map-preview-card.tsx
git commit -m "feat: build approved reports map"
```

### Task 11: Add README and Final Verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write setup instructions**

Document env vars, Supabase migration/seed commands, local dev, password login, and the fact that Telegram bot API key is not needed until ingestion is implemented.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Start dev server**

Run: `npm run dev`

Expected: server starts on `http://localhost:3000` or the next available port.

- [ ] **Step 4: Browser check**

Open `/login`, `/dashboard`, `/reports`, one `/reports/[id]`, and `/map`. Verify the app is RTL, nonblank, readable, and the map renders.

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md
git commit -m "docs: add mvp setup guide"
```

## Self-Review

- Spec coverage: all requested pages, schema, seed data, Supabase env handling, password protection, UI style, and README are mapped to tasks.
- Placeholder scan: no unfinished markers or unspecified implementation steps remain.
- Type consistency: database names, route names, and helper names are consistent across tasks.
