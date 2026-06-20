create table if not exists public.telegram_rate_limits (
  telegram_user_id text primary key,
  window_started_at timestamptz not null default now(),
  message_count integer not null default 0 check (message_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_rate_limits_window_started_at_idx
  on public.telegram_rate_limits (window_started_at);

drop trigger if exists telegram_rate_limits_set_updated_at on public.telegram_rate_limits;
create trigger telegram_rate_limits_set_updated_at
before update on public.telegram_rate_limits
for each row
execute function public.set_updated_at();

alter table public.telegram_rate_limits enable row level security;
