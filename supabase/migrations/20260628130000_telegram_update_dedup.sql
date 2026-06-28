-- Idempotency: dedupe Telegram webhook updates by update_id.
--
-- Telegram redelivers an update on any non-2xx / slow response. The webhook does heavy
-- async work (image download, AI, DB writes) before returning 200, so replays are likely.
-- Recording each update_id and short-circuiting replays makes the whole pipeline safe at
-- the entry point (the root multiplier behind the other idempotency gaps).

create table if not exists public.telegram_processed_updates (
  update_id bigint primary key,
  processed_at timestamptz not null default now()
);

create index if not exists telegram_processed_updates_processed_at_idx
  on public.telegram_processed_updates (processed_at desc);

alter table public.telegram_processed_updates enable row level security;

-- No anon policy: only the service-role key (which bypasses RLS) ever touches this table.
