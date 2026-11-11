-- End-to-end server test. Runs as the browser role (anon).
-- Usage (local Postgres):  psql -v ON_ERROR_STOP=1 -f supabase/tests/flow_test.sql
\set QUIET on
set role anon;

do $$
declare
  room jsonb; rid uuid; ht text;
  p jsonb[] := '{}';
  j jsonb; st jsonb; i int; ok boolean;
  pid uuid; tok text;
begin
  room := public.create_room();
  rid := (room->>'roomId')::uuid; ht := room->>'hostToken';
  raise notice '1. room created: %', room->>'code';

  for i in 1..10 loop
    p := p || public.join_room(room->>'code', 'Guest ' || i, case when i % 2 = 0 then 'ar' else 'en' end);
  end loop;
  raise notice '2-3. 10 participants joined (EN + AR)';

  -- duplicate nickname rejected
  begin perform public.join_room(room->>'code', 'guest 1', 'en'); raise exception 'FAIL dup name';
  exception when others then if sqlerrm <> 'NAME_TAKEN' then raise; end if; end;

  -- direct table access must be denied
  begin perform count(*) from public.answers; raise exception 'FAIL table readable';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from private.answer_keys; raise exception 'FAIL keys readable';
  exception when insufficient_privilege then null; end;
  raise notice '   direct table access denied (RLS/grants OK)';

  -- wrong host token
  begin perform public.host_action(rid, 'bad', 'start'); raise exception 'FAIL host';
  exception when others then if sqlerrm <> 'HOST_INVALID' then raise; end if; end;

  -- cannot answer before start
  begin perform public.submit_answer((p[1]->>'participantId')::uuid, p[1]->>'token', 'a1q1', 'B');
        raise exception 'FAIL early';
  exception when others then if sqlerrm <> 'ACTIVITY_CLOSED' then raise; end if; end;

  st := public.host_action(rid, ht, 'start');
  raise notice '4. activity 1 started, phase=% idx=%', st#>>'{room,phase}', st#>>'{room,activityIndex}';
  if st->'keys' <> '{}'::jsonb then raise exception 'FAIL keys leaked during activity'; end if;

  -- Activity 1: participants 1-7 answer B (correct), 8-9 answer A, 10 does not answer
  for i in 1..9 loop
    perform public.submit_answer((p[i]->>'participantId')::uuid, p[i]->>'token', 'a1q1',
                                 case when i <= 7 then 'B' else 'A' end);
  end loop;
  begin perform public.submit_answer((p[1]->>'participantId')::uuid, p[1]->>'token', 'a1q1', 'C');
        raise exception 'FAIL duplicate accepted';
  exception when others then if sqlerrm <> 'ALREADY_ANSWERED' then raise; end if; end;
  raise notice '7. duplicate answer rejected';

  st := public.get_state(rid, (p[1]->>'participantId')::uuid, p[1]->>'token');
  raise notice '   live counts a1q1 = %, keys = %', st#>'{counts,a1q1}', st->'keys';
  if st->'keys' <> '{}'::jsonb then raise exception 'FAIL keys leaked'; end if;

  -- simulate timer expiry
  reset role;
  update public.rooms set phase_ends_at = now() - interval '1 second' where id = rid;
  set role anon;
  st := public.get_state(rid);
  raise notice '8. timer expiry auto-closed: phase=%', st#>>'{room,phase}';
  if st#>>'{room,phase}' <> 'reveal' then raise exception 'FAIL autoclose'; end if;
  raise notice '9. keys revealed after close: %', st->'keys';

  -- Activity 2: everyone answers → auto close when all done
  st := public.host_action(rid, ht, 'next');
  for i in 1..10 loop
    perform public.submit_answer((p[i]->>'participantId')::uuid, p[i]->>'token', 'a2q1',
                                 case when i <= 5 then 'B' else 'D' end);
  end loop;
  st := public.get_state(rid);
  raise notice '   activity 2 auto-closed when all answered: phase=%', st#>>'{room,phase}';
  if st#>>'{room,phase}' <> 'reveal' then raise exception 'FAIL all-answered close'; end if;

  -- Activity 3: What-If
  st := public.host_action(rid, ht, 'next');
  begin perform public.submit_answer((p[1]->>'participantId')::uuid, p[1]->>'token', 'a3q1', '{"price":800000,"discount":45}');
        raise exception 'FAIL invalid whatif';
  exception when others then if sqlerrm <> 'ANSWER_INVALID' then raise; end if; end;
  for i in 1..8 loop
    perform public.submit_answer((p[i]->>'participantId')::uuid, p[i]->>'token', 'a3q1',
      jsonb_build_object('price', 800000, 'discount', i * 3)::text);
  end loop;
  st := public.host_action(rid, ht, 'close');
  raise notice '10. what-if buckets = %', st#>'{counts,a3q1}';

  -- Activity 4: two classifications
  st := public.host_action(rid, ht, 'next');
  for i in 1..10 loop
    perform public.submit_answer((p[i]->>'participantId')::uuid, p[i]->>'token', 'a4q1',
                                 case when i <= 9 then 'risky' else 'safe' end);
    perform public.submit_answer((p[i]->>'participantId')::uuid, p[i]->>'token', 'a4q2',
                                 case when i <= 6 then 'safe' else 'risky' end);
  end loop;
  st := public.get_state(rid);
  raise notice '11. AI challenge closed: phase=% counts=%', st#>>'{room,phase}', st#>'{counts}'->'a4q1';

  st := public.host_action(rid, ht, 'next');
  raise notice '12-13. results: stats=%', st->'stats';
  raise notice '   #1 %', st->'leaderboard'->0;
  raise notice '   #10 %', st->'leaderboard'->9;
  -- Guest 1: a1 100 + a2 100 + a3 100 + a4 50+50 = 400
  if (st->'leaderboard'->0->>'total')::int <> 400 then raise exception 'FAIL score'; end if;
  if jsonb_array_length(st->'leaderboard'->0->'badges') <> 3 then raise exception 'FAIL badges'; end if;

  -- 14. reconnect with saved token
  st := public.get_state(rid, (p[3]->>'participantId')::uuid, p[3]->>'token');
  raise notice '14. reconnect: me=% my answers=%', st#>>'{me,name}', st->'mine';
  begin perform public.get_state(rid, (p[3]->>'participantId')::uuid, 'stolen');
        raise exception 'FAIL bad token';
  exception when others then if sqlerrm <> 'SESSION_INVALID' then raise; end if; end;

  st := public.host_action(rid, ht, 'final');
  st := public.host_action(rid, ht, 'restart');
  raise notice '15. restart: phase=% participants kept=% counts=%', st#>>'{room,phase}',
    jsonb_array_length(st->'participants'), st->'counts';
  if st->'counts' <> '{}'::jsonb then raise exception 'FAIL restart'; end if;

  raise notice 'ALL SERVER TESTS PASSED';
end $$;
