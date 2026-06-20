create extension if not exists "pgcrypto";

create table if not exists public.reporters (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text unique,
  full_name text not null,
  phone_number text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.reporters(id) on delete set null,
  image_url text not null,
  latitude numeric not null,
  longitude numeric not null,
  area text,
  city text,
  user_description text,
  ai_category text,
  ai_severity text check (ai_severity in ('low', 'medium', 'high', 'urgent')),
  ai_confidence numeric check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)),
  ai_validation_status text not null default 'pending' check (ai_validation_status in ('approved', 'rejected', 'needs_more_info', 'pending')),
  ai_validation_reason text,
  ai_image_analysis text,
  generated_complaint_arabic text,
  public_status text not null default 'new' check (public_status in ('new', 'sent', 'acknowledged', 'fixed', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_votes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete cascade,
  telegram_user_id text,
  vote text not null check (vote in ('still_there', 'fixed', 'fake')),
  created_at timestamptz not null default now()
);

create index if not exists reporters_telegram_user_id_idx on public.reporters (telegram_user_id);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists reports_validation_status_idx on public.reports (ai_validation_status);
create index if not exists reports_severity_idx on public.reports (ai_severity);
create index if not exists reports_city_area_idx on public.reports (city, area);
create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists report_votes_report_id_idx on public.report_votes (report_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
before update on public.reports
for each row
execute function public.set_updated_at();

alter table public.reporters enable row level security;
alter table public.reports enable row level security;
alter table public.report_votes enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-images',
  'report-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
