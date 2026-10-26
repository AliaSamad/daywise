-- Verifies RLS isolation, the no-overlap constraint and apply_plan.
\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com', '{"display_name":"Ada"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com', '{}');

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.tasks (id, user_id, title, estimated_minutes) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Essay', 300);
do $$ begin assert (select display_name from public.profiles) = 'Ada', 'signup trigger creates the profile'; end $$;
select public.apply_plan(now(), now() + interval '1 day', jsonb_build_array(
  jsonb_build_object('task_id','aaaaaaaa-0000-0000-0000-000000000001','kind','task',
    'start_at', (now() + interval '1 hour')::text, 'end_at', (now() + interval '2 hours')::text),
  jsonb_build_object('task_id', null,'kind','break',
    'start_at', (now() + interval '2 hours')::text, 'end_at', (now() + interval '130 minutes')::text)
)) is not null as plan_applied;
do $$ begin assert (select count(*) from public.scheduled_sessions) = 2, 'apply_plan should insert 2 sessions'; end $$;

-- overlap must fail
do $$ begin
  insert into public.scheduled_sessions (user_id, task_id, kind, start_at, end_at)
  values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','task', now() + interval '90 minutes', now() + interval '3 hours');
  raise exception 'overlap was allowed';
exception when exclusion_violation then raise notice 'overlap correctly rejected';
end $$;

-- user B sees nothing and cannot write into A's rows
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from public.tasks) = 0, 'user B must not see user A tasks';
  assert (select count(*) from public.scheduled_sessions) = 0, 'user B must not see user A sessions';
  assert (select count(*) from public.profiles) = 1, 'user B sees only their own profile';
end $$;
update public.tasks set title = 'hacked';
do $$ begin
  insert into public.tasks (user_id, title, estimated_minutes) values ('11111111-1111-1111-1111-111111111111', 'x', 10);
  raise exception 'cross-user insert allowed';
exception when insufficient_privilege then raise notice 'cross-user insert correctly rejected';
end $$;
do $$ begin
  insert into public.scheduled_sessions (user_id, task_id, kind, start_at, end_at)
  values ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001','task', now() + interval '5 hours', now() + interval '6 hours');
  raise exception 'referencing foreign task allowed';
exception when raise_exception then raise notice 'foreign task reference rejected: %', sqlerrm;
end $$;

-- delete account cascades
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin assert (select title from public.tasks) = 'Essay', 'user B must not be able to update user A rows'; end $$;
select public.delete_my_account();
reset role;
do $$ begin
  assert (select count(*) from public.tasks) = 0, 'account deletion must cascade to tasks';
  assert (select count(*) from public.scheduled_sessions) = 0, 'account deletion must cascade to sessions';
  assert (select count(*) from auth.users) = 1, 'only the deleted user is removed';
end $$;
