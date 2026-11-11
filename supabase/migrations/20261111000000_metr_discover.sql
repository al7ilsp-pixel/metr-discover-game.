-- =====================================================================
-- METR – Discover the Decision  |  مِتر – اكتشف القرار
-- Independent database schema for the live interactive experience.
-- Run this in a NEW Supabase project (not the main Metr database).
--
-- Security model
--   * Every table has Row Level Security ON with NO policies for
--     anon/authenticated, so the browser can never read or write the
--     tables directly.
--   * All reads and writes go through SECURITY DEFINER functions (RPC)
--     that validate host tokens / participant tokens on the server.
--   * Correct answers and token hashes live in the "private" schema,
--     which the public API cannot reach.
--   * Scoring happens on the server when an activity closes.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- 1. rooms
-- ---------------------------------------------------------------------
create table if not exists public.rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  phase            text not null default 'lobby'
                   check (phase in ('lobby','active','reveal','results','final')),
  activity_index   int  not null default -1 check (activity_index between -1 and 3),
  phase_started_at timestamptz,
  phase_ends_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists private.room_secrets (
  room_id         uuid primary key references public.rooms(id) on delete cascade,
  host_token_hash text not null
);

-- ---------------------------------------------------------------------
-- 2. participants  (nickname only – no personal data)
-- ---------------------------------------------------------------------
create table if not exists public.participants (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  lang         text not null default 'en' check (lang in ('en','ar')),
  joined_at    timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
create index if not exists participants_room_idx on public.participants(room_id);

create table if not exists private.participant_secrets (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  token_hash     text not null
);

-- ---------------------------------------------------------------------
-- 3. activities  (static content)
-- ---------------------------------------------------------------------
create table if not exists public.activities (
  idx              int primary key check (idx between 0 and 3),
  key              text not null unique,
  kind             text not null check (kind in ('choice','whatif','classify')),
  duration_seconds int  not null check (duration_seconds between 10 and 180),
  title_en         text not null,
  title_ar         text not null
);

-- ---------------------------------------------------------------------
-- 4. questions  (public content, NO correct answers here)
-- ---------------------------------------------------------------------
create table if not exists public.questions (
  id           text primary key,
  activity_idx int  not null references public.activities(idx),
  position     int  not null default 1,
  kind         text not null check (kind in ('choice','whatif','classify')),
  prompt_en    text not null,
  prompt_ar    text not null,
  options      jsonb not null default '[]'::jsonb,
  points       int  not null default 100
);

create table if not exists private.answer_keys (
  question_id   text primary key references public.questions(id) on delete cascade,
  correct_value text not null
);

-- ---------------------------------------------------------------------
-- 5. answers  (one per participant per question – duplicates blocked)
-- ---------------------------------------------------------------------
create table if not exists public.answers (
  id             bigint generated always as identity primary key,
  room_id        uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  question_id    text not null references public.questions(id),
  value          text not null check (char_length(value) <= 200),
  is_correct     boolean,          -- filled by the server when the activity closes
  points         int not null default 0,
  submitted_at   timestamptz not null default now(),
  unique (participant_id, question_id)
);
create index if not exists answers_room_idx on public.answers(room_id, question_id);

-- ---------------------------------------------------------------------
-- 6. scores
-- ---------------------------------------------------------------------
create table if not exists public.scores (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  room_id        uuid not null references public.rooms(id) on delete cascade,
  total          int not null default 0,
  correct_count  int not null default 0,
  updated_at     timestamptz not null default now()
);
create index if not exists scores_room_idx on public.scores(room_id);

-- ---------------------------------------------------------------------
-- 7. room_events  (audit log of host actions)
-- ---------------------------------------------------------------------
create table if not exists public.room_events (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.rooms(id) on delete cascade,
  event      text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists room_events_room_idx on public.room_events(room_id);

-- ---------------------------------------------------------------------
-- Row Level Security: ON everywhere, no direct policies for clients.
-- ---------------------------------------------------------------------
alter table public.rooms         enable row level security;
alter table public.participants  enable row level security;
alter table public.activities    enable row level security;
alter table public.questions     enable row level security;
alter table public.answers       enable row level security;
alter table public.scores        enable row level security;
alter table public.room_events   enable row level security;
alter table private.room_secrets        enable row level security;
alter table private.participant_secrets enable row level security;
alter table private.answer_keys         enable row level security;

revoke all on all tables in schema public  from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

-- Activity and question CONTENT is public (no answers inside), read-only.
grant select on public.activities, public.questions to anon, authenticated;
drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities for select to anon, authenticated using (true);
drop policy if exists questions_read on public.questions;
create policy questions_read on public.questions for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- Seed content (fictional, educational)
-- ---------------------------------------------------------------------
insert into public.activities (idx, key, kind, duration_seconds, title_en, title_ar) values
  (0, 'spot_problem',  'choice',   45, 'Can You Spot the Problem?',       'هل تستطيع اكتشاف المشكلة؟'),
  (1, 'make_decision', 'choice',   60, 'What Would You Do?',              'ماذا ستفعل؟'),
  (2, 'what_if',       'whatif',   90, 'What If You Changed the Price?',  'ماذا لو غيّرت السعر؟'),
  (3, 'ai_risk',       'classify', 60, 'Safe or Risky?',                  'آمن أم يشكل خطراً؟')
on conflict (idx) do update set key = excluded.key, kind = excluded.kind,
  duration_seconds = excluded.duration_seconds, title_en = excluded.title_en, title_ar = excluded.title_ar;

insert into public.questions (id, activity_idx, position, kind, prompt_en, prompt_ar, options, points) values
  ('a1q1', 0, 1, 'choice', 'What is the biggest challenge?', 'ما التحدي الأكبر؟', '["A","B","C","D"]', 100),
  ('a2q1', 1, 1, 'choice', 'What should the manager do first?', 'ما أول ما يجب أن يفعله المدير؟', '["A","B","C","D"]', 100),
  ('a3q1', 2, 1, 'whatif', 'Test a pricing scenario.', 'اختبر سيناريو للتسعير.', '[]', 100),
  ('a4q1', 3, 1, 'classify', 'Entering a customer''s national ID into a public AI tool.',
     'إدخال رقم الهوية الوطنية لعميل في أداة ذكاء اصطناعي عامة.', '["safe","risky"]', 50),
  ('a4q2', 3, 2, 'classify', 'Using non-sensitive, anonymized real estate data to analyze market trends.',
     'استخدام بيانات عقارية غير حساسة ومجهولة الهوية لتحليل اتجاهات السوق.', '["safe","risky"]', 50)
on conflict (id) do update set activity_idx = excluded.activity_idx, position = excluded.position,
  kind = excluded.kind, prompt_en = excluded.prompt_en, prompt_ar = excluded.prompt_ar,
  options = excluded.options, points = excluded.points;

insert into private.answer_keys (question_id, correct_value) values
  ('a1q1', 'B'), ('a2q1', 'B'), ('a3q1', '*'), ('a4q1', 'risky'), ('a4q2', 'safe')
on conflict (question_id) do update set correct_value = excluded.correct_value;

-- =====================================================================
-- Internal helpers (private schema – not callable from the browser)
-- =====================================================================

create or replace function private.hash_token(p_token text)
returns text language sql immutable
set search_path = extensions, pg_temp
as $$ select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') $$;

create or replace function private.new_token()
returns text language sql volatile
set search_path = extensions, pg_temp
as $$ select encode(extensions.gen_random_bytes(24), 'hex') $$;

create or replace function private.ms(p_ts timestamptz)
returns bigint language sql immutable
as $$ select case when p_ts is null then null else (extract(epoch from p_ts) * 1000)::bigint end $$;

-- Validates a participant token and returns the participant row.
create or replace function private.auth_participant(p_participant uuid, p_token text)
returns public.participants
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare v public.participants;
begin
  select p.* into v
  from public.participants p
  join private.participant_secrets s on s.participant_id = p.id
  where p.id = p_participant and s.token_hash = private.hash_token(p_token);
  if not found then
    raise exception 'SESSION_INVALID';
  end if;
  return v;
end $$;

create or replace function private.auth_host(p_room uuid, p_token text)
returns void
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
begin
  if not exists (select 1 from private.room_secrets
                 where room_id = p_room and host_token_hash = private.hash_token(p_token)) then
    raise exception 'HOST_INVALID';
  end if;
end $$;

-- Grades every answer of one activity and refreshes the room's scores.
create or replace function private.grade_activity(p_room uuid, p_idx int)
returns void
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
begin
  update public.answers a
     set is_correct = case
                        when k.correct_value = '*' then true   -- What-If: valid completion
                        else a.value = k.correct_value
                      end,
         points     = case
                        when k.correct_value = '*' or a.value = k.correct_value then q.points
                        else 0
                      end
    from public.questions q
    join private.answer_keys k on k.question_id = q.id
   where a.room_id = p_room
     and a.question_id = q.id
     and q.activity_idx = p_idx;

  insert into public.scores (participant_id, room_id, total, correct_count, updated_at)
  select p.id, p.room_id,
         coalesce(sum(a.points), 0),
         coalesce(count(*) filter (where a.is_correct), 0),
         now()
    from public.participants p
    left join public.answers a on a.participant_id = p.id
   where p.room_id = p_room
   group by p.id, p.room_id
  on conflict (participant_id) do update
     set total = excluded.total, correct_count = excluded.correct_count, updated_at = now();
end $$;

create or replace function private.close_activity(p_room uuid)
returns void
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room for update;
  if r.phase <> 'active' then return; end if;
  perform private.grade_activity(p_room, r.activity_index);
  update public.rooms
     set phase = 'reveal', phase_ends_at = now(), updated_at = now()
   where id = p_room;
  insert into public.room_events (room_id, event, payload)
  values (p_room, 'activity_closed', jsonb_build_object('activity', r.activity_index));
end $$;

-- Server-side timer: closes the activity when time is up
-- or when every participant has completed it.
create or replace function private.maybe_autoclose(p_room uuid)
returns void
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  r public.rooms;
  v_total int;
  v_done  int;
  v_qcount int;
begin
  select * into r from public.rooms where id = p_room;
  if not found or r.phase <> 'active' then return; end if;

  if now() >= r.phase_ends_at then
    perform private.close_activity(p_room);
    return;
  end if;

  select count(*) into v_qcount from public.questions where activity_idx = r.activity_index;
  select count(*) into v_total from public.participants where room_id = p_room;
  select count(*) into v_done from (
    select a.participant_id
      from public.answers a
      join public.questions q on q.id = a.question_id
     where a.room_id = p_room and q.activity_idx = r.activity_index
     group by a.participant_id
    having count(*) >= v_qcount
  ) d;

  if v_total > 0 and v_done >= v_total then
    perform private.close_activity(p_room);
  end if;
end $$;

-- Builds the full room snapshot used by every screen.
create or replace function private.room_state(p_room uuid, p_participant uuid)
returns jsonb
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  r public.rooms;
  v_participants jsonb;
  v_counts jsonb;
  v_completed jsonb;
  v_mine jsonb;
  v_keys jsonb;
  v_board jsonb := null;
  v_stats jsonb := null;
  v_me jsonb := null;
  v_pcount int;
begin
  select * into r from public.rooms where id = p_room;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select count(*) into v_pcount from public.participants where room_id = p_room;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.display_name, 'lang', p.lang,
           'online', p.last_seen > now() - interval '25 seconds')
         order by p.joined_at), '[]'::jsonb)
    into v_participants
    from public.participants p where p.room_id = p_room;

  -- Live response distribution (no correctness information).
  select coalesce(jsonb_object_agg(qid, buckets), '{}'::jsonb) into v_counts
  from (
    select qid, jsonb_object_agg(bucket, n) as buckets
    from (
      select a.question_id as qid,
             case when q.kind = 'whatif' then
               case when (a.value::jsonb ->> 'discount')::int <= 10 then '0-10'
                    when (a.value::jsonb ->> 'discount')::int <= 20 then '11-20'
                    else '21-30' end
             else a.value end as bucket,
             count(*) as n
        from public.answers a
        join public.questions q on q.id = a.question_id
       where a.room_id = p_room
       group by 1, 2
    ) x group by qid
  ) y;

  -- Participants who completed each activity.
  select coalesce(jsonb_object_agg(idx::text, n), '{}'::jsonb) into v_completed
  from (
    select d.activity_idx as idx, count(*) as n
      from (
        select a.participant_id, q2.activity_idx, count(*) as answered
          from public.answers a
          join public.questions q2 on q2.id = a.question_id
         where a.room_id = p_room
         group by 1, 2
      ) d
      join (select activity_idx, count(*) as qn from public.questions group by 1) qc
        on qc.activity_idx = d.activity_idx
     where d.answered >= qc.qn
     group by 1
  ) z;

  -- Correct answers only for activities that are already closed.
  select coalesce(jsonb_object_agg(k.question_id, k.correct_value), '{}'::jsonb) into v_keys
    from private.answer_keys k
    join public.questions q on q.id = k.question_id
   where r.phase in ('results', 'final')
      or q.activity_idx < r.activity_index
      or (q.activity_idx = r.activity_index and r.phase = 'reveal');

  if p_participant is not null then
    select jsonb_build_object('id', p.id, 'name', p.display_name, 'lang', p.lang)
      into v_me from public.participants p where p.id = p_participant;
    select coalesce(jsonb_object_agg(a.question_id, a.value), '{}'::jsonb)
      into v_mine from public.answers a where a.participant_id = p_participant;
  else
    v_mine := '{}'::jsonb;
  end if;

  if r.phase in ('results', 'final') then
    select coalesce(jsonb_agg(row_to_json(b)::jsonb order by b.rank), '[]'::jsonb) into v_board
    from (
      select p.id, p.display_name as name,
             coalesce(s.total, 0) as total,
             coalesce(s.correct_count, 0) as correct,
             rank() over (order by coalesce(s.total, 0) desc, coalesce(s.correct_count, 0) desc) as rank,
             array_remove(array[
               case when exists (select 1 from public.answers a where a.participant_id = p.id
                                  and a.question_id = 'a1q1' and a.is_correct) then 'data_explorer' end,
               case when exists (select 1 from public.answers a where a.participant_id = p.id
                                  and a.question_id = 'a2q1' and a.is_correct)
                     and exists (select 1 from public.answers a where a.participant_id = p.id
                                  and a.question_id = 'a3q1') then 'decision_maker' end,
               case when (select count(*) from public.answers a where a.participant_id = p.id
                           and a.question_id in ('a4q1','a4q2') and a.is_correct) = 2
                    then 'ai_guardian' end
             ], null) as badges
        from public.participants p
        left join public.scores s on s.participant_id = p.id
       where p.room_id = p_room
    ) b;

    select jsonb_build_object(
             'average', coalesce(round(avg(coalesce(s.total, 0))), 0),
             'participation', case when v_pcount = 0 then 0 else
               round(100.0 * (select count(*) from public.answers where room_id = p_room)
                     / (v_pcount * (select count(*) from public.questions))) end,
             'maxScore', (select sum(points) from public.questions))
      into v_stats
      from public.participants p
      left join public.scores s on s.participant_id = p.id
     where p.room_id = p_room;
  end if;

  return jsonb_build_object(
    'serverNow', private.ms(now()),
    'room', jsonb_build_object(
       'id', r.id, 'code', r.code, 'phase', r.phase,
       'activityIndex', r.activity_index,
       'startedAt', private.ms(r.phase_started_at),
       'endsAt', private.ms(r.phase_ends_at)),
    'participants', v_participants,
    'counts', v_counts,
    'completed', v_completed,
    'keys', v_keys,
    'mine', v_mine,
    'me', v_me,
    'leaderboard', v_board,
    'stats', v_stats
  );
end $$;

-- =====================================================================
-- Public API (RPC) – the only things the browser can call
-- =====================================================================

create or replace function public.create_room()
returns jsonb
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_code text;
  v_room uuid;
  v_token text := private.new_token();
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;

  insert into public.rooms (code) values (v_code) returning id into v_room;
  insert into private.room_secrets (room_id, host_token_hash) values (v_room, private.hash_token(v_token));
  insert into public.room_events (room_id, event) values (v_room, 'room_created');

  return jsonb_build_object('roomId', v_room, 'code', v_code, 'hostToken', v_token);
end $$;

create or replace function public.find_room(p_code text)
returns uuid
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare v uuid;
begin
  select id into v from public.rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  return v;
end $$;

create or replace function public.join_room(p_code text, p_name text, p_lang text)
returns jsonb
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_room uuid;
  v_pid uuid;
  v_token text := private.new_token();
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  select id into v_room from public.rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 24 then raise exception 'NAME_INVALID'; end if;
  if (select count(*) from public.participants where room_id = v_room) >= 200 then
    raise exception 'ROOM_FULL';
  end if;
  if exists (select 1 from public.participants where room_id = v_room and lower(display_name) = lower(v_name)) then
    raise exception 'NAME_TAKEN';
  end if;

  insert into public.participants (room_id, display_name, lang)
  values (v_room, v_name, case when p_lang = 'ar' then 'ar' else 'en' end)
  returning id into v_pid;
  insert into private.participant_secrets (participant_id, token_hash) values (v_pid, private.hash_token(v_token));
  insert into public.scores (participant_id, room_id) values (v_pid, v_room);

  return jsonb_build_object('roomId', v_room, 'participantId', v_pid, 'token', v_token);
end $$;

create or replace function public.get_state(p_room uuid, p_participant uuid default null, p_token text default null)
returns jsonb
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare v public.participants;
begin
  if p_participant is not null then
    v := private.auth_participant(p_participant, p_token);
    if v.room_id <> p_room then raise exception 'SESSION_INVALID'; end if;
    update public.participants set last_seen = now() where id = p_participant;
  end if;
  perform private.maybe_autoclose(p_room);
  return private.room_state(p_room, p_participant);
end $$;

create or replace function public.set_language(p_participant uuid, p_token text, p_lang text)
returns void
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.auth_participant(p_participant, p_token);
  update public.participants set lang = case when p_lang = 'ar' then 'ar' else 'en' end
   where id = p_participant;
end $$;

create or replace function public.submit_answer(p_participant uuid, p_token text, p_question text, p_value text)
returns jsonb
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v public.participants;
  r public.rooms;
  q public.questions;
  v_value text := trim(coalesce(p_value, ''));
  v_json jsonb;
  v_price numeric;
  v_disc numeric;
  v_inserted int;
begin
  v := private.auth_participant(p_participant, p_token);
  perform private.maybe_autoclose(v.room_id);
  select * into r from public.rooms where id = v.room_id;
  select * into q from public.questions where id = p_question;
  if not found then raise exception 'QUESTION_INVALID'; end if;

  if r.phase <> 'active' or q.activity_idx <> r.activity_index then
    raise exception 'ACTIVITY_CLOSED';
  end if;
  if now() > r.phase_ends_at + interval '1 second' then
    raise exception 'ACTIVITY_CLOSED';
  end if;

  if q.kind = 'choice' and v_value not in ('A','B','C','D') then raise exception 'ANSWER_INVALID'; end if;
  if q.kind = 'classify' and v_value not in ('safe','risky') then raise exception 'ANSWER_INVALID'; end if;
  if q.kind = 'whatif' then
    begin
      v_json  := v_value::jsonb;
      v_price := (v_json ->> 'price')::numeric;
      v_disc  := (v_json ->> 'discount')::numeric;
    exception when others then
      raise exception 'ANSWER_INVALID';
    end;
    if v_price is null or v_disc is null
       or v_price < 500000 or v_price > 1200000
       or v_disc < 0 or v_disc > 30 then
      raise exception 'ANSWER_INVALID';
    end if;
    v_value := jsonb_build_object('price', round(v_price), 'discount', round(v_disc))::text;
  end if;

  insert into public.answers (room_id, participant_id, question_id, value)
  values (v.room_id, p_participant, p_question, v_value)
  on conflict (participant_id, question_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then raise exception 'ALREADY_ANSWERED'; end if;

  update public.participants set last_seen = now() where id = p_participant;
  perform private.maybe_autoclose(v.room_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.host_action(p_room uuid, p_token text, p_action text)
returns jsonb
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  r public.rooms;
  v_dur int;
begin
  perform private.auth_host(p_room, p_token);
  perform private.maybe_autoclose(p_room);
  select * into r from public.rooms where id = p_room for update;

  if p_action = 'start' and r.phase = 'lobby' then
    select duration_seconds into v_dur from public.activities where idx = 0;
    update public.rooms set phase = 'active', activity_index = 0,
           phase_started_at = now(), phase_ends_at = now() + make_interval(secs => v_dur),
           updated_at = now() where id = p_room;

  elsif p_action = 'close' and r.phase = 'active' then
    perform private.close_activity(p_room);

  elsif p_action = 'next' and r.phase = 'reveal' and r.activity_index < 3 then
    select duration_seconds into v_dur from public.activities where idx = r.activity_index + 1;
    update public.rooms set phase = 'active', activity_index = r.activity_index + 1,
           phase_started_at = now(), phase_ends_at = now() + make_interval(secs => v_dur),
           updated_at = now() where id = p_room;

  elsif p_action = 'next' and r.phase = 'reveal' and r.activity_index = 3 then
    update public.rooms set phase = 'results', phase_started_at = now(), phase_ends_at = null,
           updated_at = now() where id = p_room;

  elsif p_action = 'final' and r.phase = 'results' then
    update public.rooms set phase = 'final', phase_started_at = now(), phase_ends_at = null,
           updated_at = now() where id = p_room;

  elsif p_action = 'restart' then
    delete from public.answers where room_id = p_room;
    update public.scores set total = 0, correct_count = 0, updated_at = now() where room_id = p_room;
    update public.rooms set phase = 'lobby', activity_index = -1,
           phase_started_at = null, phase_ends_at = null, updated_at = now() where id = p_room;

  elsif p_action = 'remove_offline' and r.phase = 'lobby' then
    delete from public.participants where room_id = p_room and last_seen < now() - interval '25 seconds';

  else
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  insert into public.room_events (room_id, event, payload)
  values (p_room, 'host_' || p_action, jsonb_build_object('from_phase', r.phase, 'activity', r.activity_index));

  return private.room_state(p_room, null);
end $$;

-- Only the public API functions are executable by the browser.
revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.create_room()                           from public;
revoke execute on function public.find_room(text)                          from public;
revoke execute on function public.join_room(text, text, text)              from public;
revoke execute on function public.get_state(uuid, uuid, text)              from public;
revoke execute on function public.set_language(uuid, text, text)           from public;
revoke execute on function public.submit_answer(uuid, text, text, text)    from public;
revoke execute on function public.host_action(uuid, text, text)            from public;
grant execute on function public.create_room()                           to anon, authenticated;
grant execute on function public.find_room(text)                          to anon, authenticated;
grant execute on function public.join_room(text, text, text)              to anon, authenticated;
grant execute on function public.get_state(uuid, uuid, text)              to anon, authenticated;
grant execute on function public.set_language(uuid, text, text)           to anon, authenticated;
grant execute on function public.submit_answer(uuid, text, text, text)    to anon, authenticated;
grant execute on function public.host_action(uuid, text, text)            to anon, authenticated;

-- Optional housekeeping: delete rooms older than 3 days.
create or replace function private.cleanup_old_rooms()
returns void language sql security definer
set search_path = public, pg_temp
as $$ delete from public.rooms where created_at < now() - interval '3 days' $$;
