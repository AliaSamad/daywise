-- Daywise initial schema
-- All user data is scoped by user_id and protected by row-level security.
-- Times: instants are timestamptz; recurring wall-clock times are `time` + an IANA
-- timezone so occurrences stay at the same local time across daylight-saving changes.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_type as enum ('student', 'working');
create type public.time_of_day as enum ('morning', 'afternoon', 'evening');
create type public.weekend_mode as enum ('work', 'light', 'rest');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.task_category as enum ('study', 'work', 'personal', 'health', 'errands', 'custom');
create type public.task_status as enum ('not_started', 'in_progress', 'completed');
create type public.commitment_kind as enum (
  'lecture', 'seminar', 'lab', 'work_shift', 'meeting', 'gym', 'appointment',
  'social', 'travel', 'personal', 'other'
);
create type public.recurrence_freq as enum ('daily', 'weekly');
create type public.session_kind as enum ('task', 'break');
create type public.session_status as enum ('planned', 'done', 'skipped');
create type public.event_kind as enum ('personal', 'external');
create type public.notification_kind as enum (
  'task_reminder', 'deadline_reminder', 'schedule_change', 'morning_summary', 'evening_planning'
);

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  user_type public.user_type not null default 'student',
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Scheduling preferences (1:1 with profile)
-- ---------------------------------------------------------------------------
create table public.scheduling_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  wake_time time not null default '07:30',
  bed_time time not null default '23:00',          -- may be after midnight (e.g. 00:30)
  work_start time not null default '09:00',
  work_end time not null default '18:00',
  breakfast_time time default '08:00',             -- null = skip this meal
  lunch_time time default '12:30',
  dinner_time time default '18:30',
  meal_minutes int not null default 30 check (meal_minutes between 10 and 120),
  break_minutes int not null default 10 check (break_minutes between 5 and 60),
  focus_preference public.time_of_day not null default 'morning',
  max_focus_minutes int not null default 300 check (max_focus_minutes between 30 and 720),
  session_minutes int not null default 50 check (session_minutes between 15 and 240),
  weekend_mode public.weekend_mode not null default 'light',
  buffer_percent int not null default 15 check (buffer_percent between 0 and 50),
  wind_down_minutes int not null default 60 check (wind_down_minutes between 0 and 180),
  updated_at timestamptz not null default now(),
  check (work_start <> work_end),
  check (wake_time <> bed_time)
);
create trigger scheduling_preferences_updated_at before update on public.scheduling_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Recurrence rules (subset of RFC 5545 RRULE)
-- ---------------------------------------------------------------------------
create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  freq public.recurrence_freq not null,
  interval int not null default 1 check (interval between 1 and 12),
  by_weekday smallint[] check (by_weekday <@ array[0,1,2,3,4,5,6]::smallint[]), -- 0 = Sunday
  until_date date,
  created_at timestamptz not null default now()
);
create index recurrence_rules_user_idx on public.recurrence_rules (user_id);

-- ---------------------------------------------------------------------------
-- Fixed commitments
-- ---------------------------------------------------------------------------
create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  kind public.commitment_kind not null default 'other',
  location text check (char_length(location) <= 200),
  start_date date not null,                 -- first (or only) occurrence, local date
  start_time time not null,
  end_time time not null,                   -- end <= start means it ends the next day
  timezone text not null,
  recurrence_rule_id uuid references public.recurrence_rules (id) on delete set null,
  travel_before_minutes int not null default 0 check (travel_before_minutes between 0 and 240),
  travel_after_minutes int not null default 0 check (travel_after_minutes between 0 and 240),
  is_mandatory boolean not null default true,
  notes text check (char_length(notes) <= 2000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time <> end_time)
);
create index commitments_user_idx on public.commitments (user_id);
create trigger commitments_updated_at before update on public.commitments
  for each row execute function public.set_updated_at();

-- Individual occurrences the user has cancelled ("not this week").
create table public.commitment_exceptions (
  commitment_id uuid not null references public.commitments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  occurrence_date date not null,
  primary key (commitment_id, occurrence_date)
);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text check (char_length(description) <= 4000),
  estimated_minutes int not null check (estimated_minutes between 5 and 6000),
  deadline timestamptz,
  priority public.task_priority not null default 'medium',
  category public.task_category not null default 'personal',
  custom_category text check (char_length(custom_category) <= 40),
  splittable boolean not null default true,
  min_session_minutes int not null default 25 check (min_session_minutes between 5 and 480),
  earliest_start date,
  preferred_time public.time_of_day,
  status public.task_status not null default 'not_started',
  completed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (category <> 'custom' or custom_category is not null),
  check ((status = 'completed') = (completed_at is not null))
);
create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_user_deadline_idx on public.tasks (user_id, deadline);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Scheduled sessions: task work blocks and the breaks between them.
-- The exclusion constraint makes double-booking impossible at the database level.
-- ---------------------------------------------------------------------------
create table public.scheduled_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  kind public.session_kind not null default 'task',
  start_at timestamptz not null,
  end_at timestamptz not null,
  status public.session_status not null default 'planned',
  locked boolean not null default false,     -- placed manually; planner keeps it
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check (end_at - start_at <= interval '12 hours'),
  check ((kind = 'task') = (task_id is not null)),
  constraint scheduled_sessions_no_overlap exclude using gist (
    user_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status <> 'skipped')
);
create index scheduled_sessions_user_start_idx on public.scheduled_sessions (user_id, start_at);
create index scheduled_sessions_task_idx on public.scheduled_sessions (task_id);
create trigger scheduled_sessions_updated_at before update on public.scheduled_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Actual time tracking (Reality Mode). Phase 1 records manual "how long did it
-- really take?" answers; Phase 2 focus sessions write here too.
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  session_id uuid references public.scheduled_sessions (id) on delete set null,
  minutes int not null check (minutes between 1 and 1440),
  estimated_minutes int check (estimated_minutes between 1 and 6000),
  category public.task_category not null,
  started_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'focus')),
  created_at timestamptz not null default now()
);
create index time_entries_user_idx on public.time_entries (user_id, category);

-- ---------------------------------------------------------------------------
-- Calendar events not owned by Daywise: protected personal time and (Phase 3)
-- events imported from Google / Outlook calendars.
-- ---------------------------------------------------------------------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  kind public.event_kind not null default 'personal',
  start_at timestamptz not null,
  end_at timestamptz not null,
  source text not null default 'daywise',
  external_id text,
  created_at timestamptz not null default now(),
  check (end_at > start_at),
  unique (user_id, source, external_id)
);
create index calendar_events_user_start_idx on public.calendar_events (user_id, start_at);

-- ---------------------------------------------------------------------------
-- Plan runs: what the planner produced and the warnings it raised.
-- ---------------------------------------------------------------------------
create table public.schedule_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  range_start timestamptz not null,
  range_end timestamptz not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (range_end > range_start)
);
create index schedule_plans_user_idx on public.schedule_plans (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications (Phase 3 delivery; preferences are stored now)
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  task_reminders boolean not null default true,
  task_reminder_lead_minutes int not null default 10 check (task_reminder_lead_minutes between 0 and 120),
  deadline_reminders boolean not null default true,
  schedule_changes boolean not null default true,
  morning_summary boolean not null default true,
  morning_summary_time time not null default '08:00',
  evening_planning boolean not null default false,
  evening_planning_time time not null default '20:30',
  max_per_day int not null default 8 check (max_per_day between 1 and 30),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  read_at timestamptz,
  task_id uuid references public.tasks (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, scheduled_for);

-- ---------------------------------------------------------------------------
-- Row-level security: every table is private to its owner.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.scheduling_preferences enable row level security;
alter table public.recurrence_rules enable row level security;
alter table public.commitments enable row level security;
alter table public.commitment_exceptions enable row level security;
alter table public.tasks enable row level security;
alter table public.scheduled_sessions enable row level security;
alter table public.time_entries enable row level security;
alter table public.calendar_events enable row level security;
alter table public.schedule_plans enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array[
    'scheduling_preferences', 'recurrence_rules', 'commitments', 'commitment_exceptions',
    'tasks', 'scheduled_sessions', 'time_entries', 'calendar_events', 'schedule_plans',
    'notification_preferences', 'notifications'
  ] loop
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end;
$$;

-- Cross-table ownership: a user may only reference their own parent rows.
create or replace function public.assert_same_owner()
returns trigger language plpgsql security invoker as $$
declare
  rec jsonb := to_jsonb(new);
begin
  if tg_table_name = 'commitments' then
    if rec ->> 'recurrence_rule_id' is not null then
      perform 1 from public.recurrence_rules
        where id = (rec ->> 'recurrence_rule_id')::uuid and user_id = new.user_id;
      if not found then raise exception 'recurrence rule belongs to another user'; end if;
    end if;
  elsif tg_table_name = 'commitment_exceptions' then
    perform 1 from public.commitments
      where id = (rec ->> 'commitment_id')::uuid and user_id = new.user_id;
    if not found then raise exception 'commitment belongs to another user'; end if;
  elsif rec ->> 'task_id' is not null then
    perform 1 from public.tasks
      where id = (rec ->> 'task_id')::uuid and user_id = new.user_id;
    if not found then raise exception 'task belongs to another user'; end if;
  end if;
  return new;
end;
$$;
create trigger commitments_owner before insert or update on public.commitments
  for each row execute function public.assert_same_owner();
create trigger commitment_exceptions_owner before insert or update on public.commitment_exceptions
  for each row execute function public.assert_same_owner();
create trigger scheduled_sessions_owner before insert or update on public.scheduled_sessions
  for each row execute function public.assert_same_owner();
create trigger time_entries_owner before insert or update on public.time_entries
  for each row execute function public.assert_same_owner();
create trigger notifications_owner before insert or update on public.notifications
  for each row execute function public.assert_same_owner();

-- ---------------------------------------------------------------------------
-- New users get a profile, default preferences and notification settings.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  insert into public.scheduling_preferences (user_id) values (new.id);
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- apply_plan: atomically replace the planner-owned sessions in a window.
-- Keeps: locked sessions, completed/skipped sessions and anything that has
-- already started, so history (including missed sessions) stays visible.
-- ---------------------------------------------------------------------------
create or replace function public.apply_plan(
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_sessions jsonb,
  p_summary jsonb default '{}'::jsonb
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  plan_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_range_end <= p_range_start then raise exception 'invalid range'; end if;
  if p_range_end - p_range_start > interval '15 days' then raise exception 'range too large'; end if;

  delete from public.scheduled_sessions s
  where s.user_id = uid
    and s.locked = false
    and s.status = 'planned'
    and s.start_at >= greatest(p_range_start, now())
    and s.start_at < p_range_end;

  insert into public.scheduled_sessions (user_id, task_id, kind, start_at, end_at)
  select uid, (x ->> 'task_id')::uuid, (x ->> 'kind')::public.session_kind,
         (x ->> 'start_at')::timestamptz, (x ->> 'end_at')::timestamptz
  from jsonb_array_elements(coalesce(p_sessions, '[]'::jsonb)) as x;

  insert into public.schedule_plans (user_id, range_start, range_end, summary)
  values (uid, p_range_start, p_range_end, coalesce(p_summary, '{}'::jsonb))
  returning id into plan_id;

  return plan_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_my_account: removes the auth user; every table cascades from it.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.apply_plan(timestamptz, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.apply_plan(timestamptz, timestamptz, jsonb, jsonb) to authenticated;
