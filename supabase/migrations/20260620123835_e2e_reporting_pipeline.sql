create table if not exists public.telegram_conversations (
  telegram_user_id text primary key,
  chat_id text not null,
  state text not null check (
    state in (
      'idle',
      'awaiting_full_name',
      'awaiting_phone',
      'awaiting_photo',
      'awaiting_location',
      'awaiting_description'
    )
  ),
  draft jsonb not null default '{}'::jsonb,
  last_message_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reports
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_message_id bigint,
  add column if not exists telegram_file_id text,
  add column if not exists source text not null default 'seed' check (source in ('telegram', 'seed', 'admin')),
  add column if not exists ai_reviewed_at timestamptz,
  add column if not exists manual_reviewed_at timestamptz,
  add column if not exists manual_review_note text;

create table if not exists public.report_status_history (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  actor text not null check (actor in ('telegram_bot', 'ai', 'admin', 'system')),
  event text not null,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists telegram_conversations_updated_at_idx
  on public.telegram_conversations (updated_at desc);

create index if not exists reports_source_idx
  on public.reports (source);

create index if not exists reports_ai_reviewed_at_idx
  on public.reports (ai_reviewed_at desc);

create index if not exists report_status_history_report_id_created_at_idx
  on public.report_status_history (report_id, created_at);

drop trigger if exists telegram_conversations_set_updated_at on public.telegram_conversations;
create trigger telegram_conversations_set_updated_at
before update on public.telegram_conversations
for each row
execute function public.set_updated_at();

alter table public.telegram_conversations enable row level security;
alter table public.report_status_history enable row level security;

insert into public.report_status_history (report_id, actor, event, to_status, note, created_at)
select id, 'system', 'seed_imported', public_status, 'Seed report loaded for MVP testing.', created_at
from public.reports
where not exists (
  select 1
  from public.report_status_history h
  where h.report_id = reports.id
);
