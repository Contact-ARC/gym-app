-- Gym Crew: why aren't crew notifications arriving? Read-only: paste into SQL Editor and Run.
-- Run it within a few hours of a crew member finishing a workout (Supabase keeps the function's
-- answers for about 6 hours). Each row is one link in the chain, in order; the first ❌ is the problem.

select 1 as step, 'Function address (push_url)' as "check",
  coalesce((select value from public.crew_settings where key = 'push_url'), '❌ missing: README → Crew notifications → Supabase step 5') as result
union all
select 2, 'pg_net (lets the database call the function)',
  case when exists (select 1 from pg_extension where extname = 'pg_net') then '✅ installed'
       else '❌ not installed: Database → Extensions → pg_net → enable, then run crew.sql again' end
union all
select 3, 'Phones that can get notifications',
  coalesce((select string_agg(name || ': ' || case when push_token is null then '❌ no phone registered' else '✅ registered' end
                              || ' · workouts ' || coalesce(push_prefs ->> 'workouts', 'on') || ' · records ' || coalesce(push_prefs ->> 'records', 'on'),
                              E'\n' order by name)
            from public.crew_members), 'no members')
union all
select 4, 'Last workouts posted, and whether the function handled them',
  coalesce((select string_agg(m.name || ' · ' || to_char(e.created_at at time zone 'Europe/Madrid', 'DD Mon HH24:MI') || ' → '
                              || case when exists (select 1 from public.crew_push_log l where l.key = 'post:' || e.id)
                                      then '✅ function ran' else '❌ function never ran for it' end,
                              E'\n' order by e.created_at desc)
            from (select * from public.crew_events where kind = 'workout' order by created_at desc limit 6) e
            join public.crew_members m on m.id = e.member_id), 'no workouts posted yet');

-- Then run this one on its own (it needs pg_net from step 2). It shows the function's last answers:
--   401             → the function still checks for a key: crew-push → Settings → turn OFF "Verify JWT", Save
--   404             → push_url is wrong (step 1): check the project address and the name crew-push
--   500 not configured → the FCM_SERVICE_ACCOUNT secret is missing or not the whole JSON file
--   200 {"sent":0}  → it ran but had nobody to send to: see step 3
--   200 {"sent":N}  → Firebase accepted it; if the phone shows nothing, check Android's notification
--                     settings for Gym Crew (and battery saving), and Crew → ⋯ → Notifications in the app
-- select created, status_code, left(coalesce(error_msg, content), 200) as answer
--   from net._http_response order by created desc limit 10;
