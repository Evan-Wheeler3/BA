-- BA Exam Coach schema. Every table has Row Level Security: a signed-in user can only
-- read and write their own rows. Server-only columns are written by Edge Functions
-- using the service role, which bypasses RLS and never leaves the server.

-- Whole study history as one JSON document per user (the app merges conflict-free).
create table if not exists public.study_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  constraint study_state_size check (pg_column_size(state) < 5 * 1024 * 1024)
);
alter table public.study_state enable row level security;
create policy "own study state: select" on public.study_state for select using (auth.uid() = user_id);
create policy "own study state: insert" on public.study_state for insert with check (auth.uid() = user_id);
create policy "own study state: update" on public.study_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own study state: delete" on public.study_state for delete using (auth.uid() = user_id);

-- Web Push subscriptions (one per device/browser).
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  failure_count int not null default 0,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  constraint endpoint_https check (endpoint like 'https://%')
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "own subscriptions: select" on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "own subscriptions: insert" on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "own subscriptions: update" on public.push_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own subscriptions: delete" on public.push_subscriptions for delete using (auth.uid() = user_id);

-- Reminder schedule + the bits the scheduler needs (next topic, completion).
create table if not exists public.reminder_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  reminder_time text not null default '21:00' check (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  days int[] not null default '{1,2,3,4,5}',
  timezone text not null default 'UTC',
  follow_up boolean not null default true,
  follow_up_minutes int not null default 60 check (follow_up_minutes between 15 and 240),
  paused_until date,
  next_topic text check (char_length(next_topic) <= 120),
  last_completed_date date,
  -- server-maintained:
  last_reminder_date date,
  last_followup_date date,
  last_test_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.reminder_prefs enable row level security;
create policy "own prefs: select" on public.reminder_prefs for select using (auth.uid() = user_id);
create policy "own prefs: insert" on public.reminder_prefs for insert with check (auth.uid() = user_id);
create policy "own prefs: update" on public.reminder_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own prefs: delete" on public.reminder_prefs for delete using (auth.uid() = user_id);

-- Per-day AI usage counter for rate limiting (written only by the grade-recall function).
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
create policy "own ai usage: select" on public.ai_usage for select using (auth.uid() = user_id);

-- Atomic increment used by grade-recall; returns the new count.
create or replace function public.increment_ai_usage(p_user uuid, p_day date)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage (user_id, day, calls) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1
  returning calls;
$$;
revoke all on function public.increment_ai_usage(uuid, date) from public, anon, authenticated;
