-- Volunteer + permit + reward system.

create table if not exists public.volunteers (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text unique,
  display_name text not null,
  phone_number text,
  total_points integer not null default 0 check (total_points >= 0),
  completed_fixes integer not null default 0 check (completed_fixes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permits (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'active', 'completed', 'rejected', 'cancelled')
  ),
  points_awarded integer not null default 0 check (points_awarded >= 0),
  admin_note text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fix_submissions (
  id uuid primary key default gen_random_uuid(),
  permit_id uuid not null references public.permits(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  image_url text not null,
  description text,
  latitude numeric,
  longitude numeric,
  source text not null default 'telegram' check (source in ('telegram', 'upload')),
  created_at timestamptz not null default now()
);

create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  permit_id uuid references public.permits(id) on delete set null,
  points integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- Only one live permit per report at a time.
create unique index if not exists permits_report_live_uniq
  on public.permits (report_id)
  where status in ('pending', 'approved', 'active');

create index if not exists permits_status_idx on public.permits (status);
create index if not exists permits_volunteer_id_idx on public.permits (volunteer_id);
create index if not exists permits_report_id_idx on public.permits (report_id);
create index if not exists permits_created_at_idx on public.permits (created_at desc);

create index if not exists volunteers_telegram_user_id_idx on public.volunteers (telegram_user_id);
create index if not exists volunteers_total_points_idx on public.volunteers (total_points desc);

create index if not exists fix_submissions_permit_id_idx on public.fix_submissions (permit_id);
create index if not exists fix_submissions_report_id_idx on public.fix_submissions (report_id);
create index if not exists fix_submissions_created_at_idx on public.fix_submissions (created_at desc);

create index if not exists points_ledger_volunteer_id_created_at_idx
  on public.points_ledger (volunteer_id, created_at desc);

drop trigger if exists volunteers_set_updated_at on public.volunteers;
create trigger volunteers_set_updated_at
before update on public.volunteers
for each row
execute function public.set_updated_at();

drop trigger if exists permits_set_updated_at on public.permits;
create trigger permits_set_updated_at
before update on public.permits
for each row
execute function public.set_updated_at();

alter table public.volunteers enable row level security;
alter table public.permits enable row level security;
alter table public.fix_submissions enable row level security;
alter table public.points_ledger enable row level security;
