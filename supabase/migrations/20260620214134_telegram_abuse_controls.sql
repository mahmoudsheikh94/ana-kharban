create table if not exists public.telegram_blocked_users (
  telegram_user_id text primary key,
  reason text not null,
  blocked_by text not null default 'admin',
  blocked_at timestamptz not null default now()
);

create table if not exists public.telegram_abuse_events (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null,
  report_id uuid references public.reports(id) on delete set null,
  purpose text not null check (purpose in ('initial_analysis', 'reanalyze_with_description')),
  created_at timestamptz not null default now()
);

create index if not exists telegram_abuse_events_user_created_at_idx
  on public.telegram_abuse_events (telegram_user_id, created_at desc);

create index if not exists telegram_abuse_events_created_at_idx
  on public.telegram_abuse_events (created_at desc);

create index if not exists ai_usage_events_user_created_at_idx
  on public.ai_usage_events (telegram_user_id, created_at desc);

create index if not exists ai_usage_events_report_purpose_idx
  on public.ai_usage_events (report_id, purpose);

create index if not exists reports_telegram_user_file_idx
  on public.reports (telegram_file_id)
  where telegram_file_id is not null;

create index if not exists reports_telegram_chat_created_at_idx
  on public.reports (telegram_chat_id, created_at desc)
  where source = 'telegram';

alter table public.telegram_blocked_users enable row level security;
alter table public.telegram_abuse_events enable row level security;
alter table public.ai_usage_events enable row level security;
