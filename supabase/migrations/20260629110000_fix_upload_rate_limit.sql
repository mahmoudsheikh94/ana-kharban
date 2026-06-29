-- IP-based rate limiting for the public fix-upload endpoint (anonymous, so keyed by client IP).

create table if not exists public.fix_upload_rate_limits (
  client_ip text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists fix_upload_rate_limits_window_started_at_idx
  on public.fix_upload_rate_limits (window_started_at);

drop trigger if exists fix_upload_rate_limits_set_updated_at on public.fix_upload_rate_limits;
create trigger fix_upload_rate_limits_set_updated_at
before update on public.fix_upload_rate_limits
for each row
execute function public.set_updated_at();

alter table public.fix_upload_rate_limits enable row level security;
