-- Gym Crew: crew board backend (Supabase free tier is plenty).
--
-- Run once: Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
-- Safe to run again after an app update: it only adds what's missing and replaces functions.
-- (Supabase warns about "destructive operations" because of the revoke/delete/drop lines:
-- none of them touch existing data. The only drop is the old 3-argument crew_react, replaced below.)
--
-- How it's locked down:
--   * Every table has row level security on and NO policies, and the public roles have no
--     table rights, so the REST API can't read or write them directly.
--   * The app only calls the crew_* functions below. Each phone has a random secret key; the
--     database stores only its SHA-256 hash, and every call checks it.
--   * The crew code is the invite: only people who know it can join and see that crew.
--   * Notifications: the database asks the crew-push Edge Function to send them (pg_net), and the
--     function asks the database what to send (crew_push_job, not callable from the app). Each
--     notification is sent once, and only for something that really happened, so calling the
--     function by hand can't spam anyone.

create extension if not exists pgcrypto with schema extensions;
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then raise notice 'pg_net not available (notifications off): %', sqlerrm;
end $$;

-- ── Tables ──────────────────────────────────────────────────

create table if not exists public.crew_members (
  id uuid primary key default gen_random_uuid(),
  crew text not null,
  name text not null,
  key_hash text not null,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crew_members_crew on public.crew_members (crew);
-- 0.6
alter table public.crew_members add column if not exists is_owner boolean not null default false;
alter table public.crew_members add column if not exists push_token text;
alter table public.crew_members add column if not exists push_prefs jsonb not null default '{}'::jsonb;
alter table public.crew_members add column if not exists lang text not null default 'en';

create table if not exists public.crew_events (
  id bigint generated always as identity primary key,
  crew text not null,
  member_id uuid not null references public.crew_members (id) on delete cascade,
  client_id text not null,
  kind text not null,
  payload jsonb not null,
  reactions jsonb not null default '{}'::jsonb, -- { memberId: 'clap' | 'fire' | 'strong' | 'laugh' } (0.5: true = clap)
  created_at timestamptz not null default now(),
  unique (member_id, client_id)
);
create index if not exists crew_events_crew_time on public.crew_events (crew, created_at desc);

create table if not exists public.crew_comments (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.crew_events (id) on delete cascade,
  crew text not null,
  member_id uuid not null references public.crew_members (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists crew_comments_event on public.crew_comments (event_id, created_at);

-- Plans people chose to share (My routines → Share with the crew)
create table if not exists public.crew_plans (
  id uuid primary key default gen_random_uuid(),
  crew text not null,
  member_id uuid not null references public.crew_members (id) on delete cascade,
  client_id text not null,
  name text not null,
  summary jsonb not null default '{}'::jsonb,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  unique (member_id, client_id)
);
create index if not exists crew_plans_crew on public.crew_plans (crew);

create table if not exists public.crew_nudges (
  from_id uuid not null references public.crew_members (id) on delete cascade,
  to_id uuid not null references public.crew_members (id) on delete cascade,
  week text not null,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id, week)
);

create table if not exists public.crew_challenges (
  id bigint generated always as identity primary key,
  crew text not null,
  created_by uuid references public.crew_members (id) on delete set null,
  kind text not null,        -- together (one target for everyone) | versus (most wins)
  metric text not null,      -- workouts | sets | volume
  period text not null,      -- week | month
  period_key text not null,  -- week: its Monday (YYYY-MM-DD); month: YYYY-MM
  target numeric,
  title text not null,
  result jsonb,              -- set when the period is over
  created_at timestamptz not null default now()
);
create index if not exists crew_challenges_crew on public.crew_challenges (crew, created_at desc);

create table if not exists public.crew_push_log (
  key text primary key,
  created_at timestamptz not null default now()
);

-- push_url: the crew-push Edge Function's address (set once, see the setup guide)
create table if not exists public.crew_settings (
  key text primary key,
  value text
);

do $$
declare tbl text;
begin
  foreach tbl in array array['crew_members', 'crew_events', 'crew_comments', 'crew_plans', 'crew_nudges',
                             'crew_challenges', 'crew_push_log', 'crew_settings'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on public.%I from anon, authenticated', tbl);
  end loop;
end $$;

-- ── Internal helpers ────────────────────────────────────────

-- Check a member id + secret key, return the member row or fail.
create or replace function public._crew_auth(p_member uuid, p_key text)
returns public.crew_members
language plpgsql stable security definer set search_path = public, extensions as $$
declare m public.crew_members;
begin
  select * into m from public.crew_members
   where id = p_member and key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex');
  if not found then raise exception 'not_a_member'; end if;
  return m;
end $$;

-- Week (its Monday) and month keys, the same as the app's, on Spanish time
create or replace function public._crew_week(p_at timestamptz default now())
returns text language sql stable as $$
  select to_char(date_trunc('week', p_at at time zone 'Europe/Madrid'), 'YYYY-MM-DD')
$$;
create or replace function public._crew_month(p_at timestamptz default now())
returns text language sql stable as $$
  select to_char(p_at at time zone 'Europe/Madrid', 'YYYY-MM')
$$;

-- Whoever started the crew can remove people. Crews from before 0.6 (or whose owner left): the longest member.
create or replace function public._crew_fix_owner(p_crew text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.crew_members where crew = p_crew and is_owner) then
    update public.crew_members set is_owner = true
     where id = (select id from public.crew_members where crew = p_crew order by created_at limit 1);
  end if;
end $$;

-- A member's number for a challenge period, from the stats their phone sends (volume in kg)
create or replace function public._crew_value(p_stats jsonb, p_period text, p_key text, p_metric text)
returns numeric language sql immutable as $$
  with s as (
    select case
      when p_period = 'week' and p_stats #>> '{week,key}' = p_key then p_stats -> 'week'
      when p_period = 'week' and p_stats #>> '{lastWeek,key}' = p_key then p_stats -> 'lastWeek'
      when p_period = 'month' and p_stats #>> '{month,key}' = p_key then p_stats -> 'month'
      when p_period = 'month' and p_stats #>> '{lastMonth,key}' = p_key then p_stats -> 'lastMonth'
    end as v
  )
  select coalesce(case
    when p_metric = 'volume' then (v ->> 'volume')::numeric * (case when v ->> 'unit' = 'lb' then 0.45359237 else 1 end)
    when p_metric in ('workouts', 'sets') then (v ->> p_metric)::numeric
  end, 0) from s
$$;

-- Ask the crew-push Edge Function to send a notification. Never fails the caller.
create or replace function public._crew_push(p_kind text, p_ref text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_url text;
begin
  select value into v_url from public.crew_settings where key = 'push_url';
  if coalesce(v_url, '') = '' then return; end if;
  perform net.http_post(url := v_url, body := jsonb_build_object('kind', p_kind, 'ref', p_ref));
exception when others then
  raise warning 'crew push not sent: %', sqlerrm;
end $$;

-- True the first time a notification key is seen
create or replace function public._crew_once(p_key text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.crew_push_log (key) values (p_key) on conflict do nothing;
  return found;
end $$;

-- Sunday from 17:00, Spanish time
create or replace function public._crew_recap_time()
returns boolean language sql stable as $$
  select extract(isodow from now() at time zone 'Europe/Madrid') = 7 and extract(hour from now() at time zone 'Europe/Madrid') >= 17
$$;

create or replace function public._crew_pref(p_prefs jsonb, p_kind text)
returns boolean language sql immutable as $$
  -- Defaults: everything on except "training now"
  select coalesce((p_prefs ->> p_kind)::boolean, p_kind <> 'live')
$$;

create or replace function public._crew_ord(p_n int, p_es boolean)
returns text language sql immutable as $$
  select case when p_es then p_n || 'º'
    when p_n % 100 in (11, 12, 13) then p_n || 'th'
    when p_n % 10 = 1 then p_n || 'st'
    when p_n % 10 = 2 then p_n || 'nd'
    when p_n % 10 = 3 then p_n || 'rd'
    else p_n || 'th' end
$$;

create or replace function public._crew_msg(p_member public.crew_members, p_title text, p_body text, p_channel text, p_route text, p_tag text)
returns jsonb language sql immutable as $$
  select jsonb_build_object('token', p_member.push_token, 'member', p_member.id, 'title', p_title, 'body', coalesce(p_body, ''),
                            'channel', p_channel, 'route', p_route, 'tag', p_tag)
$$;

-- ── Joining and leaving ─────────────────────────────────────

create or replace function public.crew_join(p_crew text, p_name text, p_key text, p_create boolean default false)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_crew text := upper(trim(coalesce(p_crew, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_crew !~ '^[A-Z0-9]{6,12}$' then raise exception 'bad_code'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 30 then raise exception 'bad_name'; end if;
  if char_length(coalesce(p_key, '')) < 32 then raise exception 'bad_key'; end if;
  if p_create then
    if exists (select 1 from public.crew_members where crew = v_crew) then raise exception 'code_taken'; end if;
  else
    if not exists (select 1 from public.crew_members where crew = v_crew) then raise exception 'crew_not_found'; end if;
  end if;
  if (select count(*) from public.crew_members where crew = v_crew) >= 50 then raise exception 'crew_full'; end if;
  insert into public.crew_members (crew, name, key_hash, is_owner)
  values (v_crew, v_name, encode(extensions.digest(p_key, 'sha256'), 'hex'), p_create)
  returning id into v_id;
  return json_build_object('member_id', v_id, 'crew', v_crew);
end $$;

create or replace function public.crew_leave(p_member uuid, p_key text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  delete from public.crew_members where id = m.id; -- their posts, comments and plans go with them
  perform public._crew_fix_owner(m.crew);
end $$;

-- The crew's owner removes someone (they can rejoin with the code; change crews to keep them out)
create or replace function public.crew_remove(p_member uuid, p_key text, p_target uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  if not m.is_owner then raise exception 'not_owner'; end if;
  if p_target = m.id then raise exception 'bad_target'; end if;
  delete from public.crew_members where id = p_target and crew = m.crew;
  if not found then raise exception 'not_found'; end if;
end $$;

-- ── Stats, posts, reactions, comments ───────────────────────

create or replace function public.crew_update(p_member uuid, p_key text, p_name text, p_stats jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  m public.crew_members := public._crew_auth(p_member, p_key);
  v_old text := m.stats #>> '{live,startedAt}';
  v_new text := p_stats #>> '{live,startedAt}';
begin
  if pg_column_size(p_stats) > 24000 then raise exception 'too_big'; end if;
  update public.crew_members
     set name = coalesce(nullif(left(trim(coalesce(p_name, '')), 30), ''), name),
         stats = coalesce(p_stats, stats),
         updated_at = now()
   where id = m.id;
  -- Just started a workout: "training now"
  if v_new is not null and v_new is distinct from v_old then
    perform public._crew_push('live', m.id::text || '|' || v_new);
  end if;
end $$;

create or replace function public.crew_post(p_member uuid, p_key text, p_client_id text, p_kind text, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  m public.crew_members := public._crew_auth(p_member, p_key);
  v_id bigint;
  v_new boolean;
begin
  if p_kind not in ('workout', 'challenge', 'badge') then raise exception 'bad_kind'; end if;
  if pg_column_size(p_payload) > 48000 then raise exception 'too_big'; end if;
  insert into public.crew_events (crew, member_id, client_id, kind, payload)
  values (m.crew, m.id, left(p_client_id, 64), p_kind, p_payload)
  on conflict (member_id, client_id) do update set kind = excluded.kind, payload = excluded.payload
  returning id, (xmax = 0) into v_id, v_new;
  -- Keep the feed small: drop anything older than 90 days
  delete from public.crew_events where crew = m.crew and created_at < now() - interval '90 days';
  -- Notify for new posts only (editing a workout later doesn't ping everyone again)
  if v_new then perform public._crew_push('post', v_id::text); end if;
end $$;

create or replace function public.crew_unpost(p_member uuid, p_key text, p_client_id text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  delete from public.crew_events where member_id = m.id and client_id = p_client_id;
end $$;

-- Reactions: one per person per post. The same one again takes it back; another one replaces it.
drop function if exists public.crew_react(uuid, text, bigint);
create or replace function public.crew_react(p_member uuid, p_key text, p_event bigint, p_kind text default 'clap')
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  m public.crew_members := public._crew_auth(p_member, p_key);
  v_owner uuid;
  v_cur text;
begin
  if p_kind not in ('clap', 'fire', 'strong', 'laugh') then raise exception 'bad_kind'; end if;
  select member_id, reactions ->> m.id::text into v_owner, v_cur
    from public.crew_events where id = p_event and crew = m.crew;
  if not found then raise exception 'not_found'; end if;
  if v_cur = p_kind or (v_cur = 'true' and p_kind = 'clap') then
    update public.crew_events set reactions = reactions - m.id::text where id = p_event;
  else
    update public.crew_events set reactions = reactions || jsonb_build_object(m.id::text, p_kind) where id = p_event;
    if v_owner <> m.id then perform public._crew_push('react', p_event::text || '|' || m.id::text); end if;
  end if;
end $$;

create or replace function public.crew_comment(p_member uuid, p_key text, p_event bigint, p_body text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  m public.crew_members := public._crew_auth(p_member, p_key);
  v_body text := trim(coalesce(p_body, ''));
  v_id bigint;
  v_at timestamptz;
begin
  if char_length(v_body) < 1 or char_length(v_body) > 500 then raise exception 'bad_comment'; end if;
  if not exists (select 1 from public.crew_events where id = p_event and crew = m.crew) then raise exception 'not_found'; end if;
  insert into public.crew_comments (event_id, crew, member_id, body)
  values (p_event, m.crew, m.id, v_body)
  returning id, created_at into v_id, v_at;
  perform public._crew_push('comment', v_id::text);
  return json_build_object('id', v_id, 'event_id', p_event, 'member_id', m.id, 'body', v_body, 'created_at', v_at);
end $$;

-- Delete your own comment (the crew's owner can delete any)
create or replace function public.crew_uncomment(p_member uuid, p_key text, p_comment bigint)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  delete from public.crew_comments where id = p_comment and crew = m.crew and (member_id = m.id or m.is_owner);
end $$;

-- One post with all its comments (the feed only carries the count and the latest)
create or replace function public.crew_thread(p_member uuid, p_key text, p_event bigint)
returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  return json_build_object(
    'event', (select row_to_json(e) from (
      select id, member_id, kind, payload, reactions, created_at
        from public.crew_events where id = p_event and crew = m.crew) e),
    'comments', coalesce((select json_agg(c order by c.created_at) from (
      select id, member_id, body, created_at
        from public.crew_comments where event_id = p_event and crew = m.crew) c), '[]'::json)
  );
end $$;

-- ── Shared plans ────────────────────────────────────────────

create or replace function public.crew_share_plan(p_member uuid, p_key text, p_client_id text, p_name text, p_summary jsonb, p_data jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  if pg_column_size(p_data) > 400000 then raise exception 'too_big'; end if;
  if not exists (select 1 from public.crew_plans where member_id = m.id and client_id = p_client_id)
     and (select count(*) from public.crew_plans where member_id = m.id) >= 20 then
    raise exception 'too_many';
  end if;
  insert into public.crew_plans (crew, member_id, client_id, name, summary, data)
  values (m.crew, m.id, left(p_client_id, 64), left(coalesce(nullif(trim(p_name), ''), '?'), 60), coalesce(p_summary, '{}'::jsonb), p_data)
  on conflict (member_id, client_id) do update
    set name = excluded.name, summary = excluded.summary, data = excluded.data, updated_at = now();
end $$;

create or replace function public.crew_unshare_plan(p_member uuid, p_key text, p_client_id text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  delete from public.crew_plans where member_id = m.id and client_id = p_client_id;
end $$;

create or replace function public.crew_get_plan(p_member uuid, p_key text, p_plan uuid)
returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  return (select row_to_json(p) from (
    select id, member_id, client_id, name, summary, data, updated_at
      from public.crew_plans where id = p_plan and crew = m.crew) p);
end $$;

-- ── Nudges ──────────────────────────────────────────────────

-- "Come train": only to someone with no workout yet this week, once a week per person
create or replace function public.crew_nudge(p_member uuid, p_key text, p_to uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  m public.crew_members := public._crew_auth(p_member, p_key);
  v_to public.crew_members;
  v_week text := public._crew_week();
begin
  if p_to = m.id then raise exception 'bad_target'; end if;
  select * into v_to from public.crew_members where id = p_to and crew = m.crew;
  if not found then raise exception 'not_found'; end if;
  if v_to.stats #>> '{week,key}' = v_week and coalesce((v_to.stats #>> '{week,workouts}')::int, 0) > 0 then
    raise exception 'already_trained';
  end if;
  insert into public.crew_nudges (from_id, to_id, week) values (m.id, p_to, v_week) on conflict do nothing;
  if not found then raise exception 'already_nudged'; end if;
  perform public._crew_push('nudge', m.id::text || '|' || p_to::text || '|' || v_week);
end $$;

-- ── Crew challenges ─────────────────────────────────────────

create or replace function public.crew_challenge_create(p_member uuid, p_key text, p_kind text, p_metric text, p_period text, p_target numeric, p_title text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  m public.crew_members := public._crew_auth(p_member, p_key);
  v_title text := left(trim(coalesce(p_title, '')), 60);
  v_id bigint;
begin
  if p_kind not in ('together', 'versus') or p_metric not in ('workouts', 'sets', 'volume') or p_period not in ('week', 'month') then
    raise exception 'bad_challenge';
  end if;
  if v_title = '' then raise exception 'bad_challenge'; end if;
  if p_kind = 'together' and (p_target is null or p_target <= 0 or p_target > 10000000) then raise exception 'bad_challenge'; end if;
  if (select count(*) from public.crew_challenges where crew = m.crew and result is null) >= 3 then raise exception 'too_many'; end if;
  insert into public.crew_challenges (crew, created_by, kind, metric, period, period_key, target, title)
  values (m.crew, m.id, p_kind, p_metric, p_period,
          case when p_period = 'week' then public._crew_week() else public._crew_month() end,
          case when p_kind = 'together' then round(p_target) end, v_title)
  returning id into v_id;
  perform public._crew_push('challenge', v_id::text);
  return json_build_object('id', v_id);
end $$;

-- Call off a challenge that's still running (whoever set it, or the owner)
create or replace function public.crew_challenge_delete(p_member uuid, p_key text, p_id bigint)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  delete from public.crew_challenges
   where id = p_id and crew = m.crew and result is null and (created_by = m.id or m.is_owner);
end $$;

-- Close challenges whose week or month is over, and post the result to the feed
create or replace function public._crew_settle(p_crew text default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  c record;
  v_vals jsonb;
  v_total numeric;
  v_best numeric;
  v_winner uuid;
  v_done boolean;
  v_poster uuid;
  v_event bigint;
begin
  for c in select * from public.crew_challenges
            where result is null and (p_crew is null or crew = p_crew)
              and ((period = 'week' and period_key < public._crew_week())
                or (period = 'month' and period_key < public._crew_month()))
  loop
    select coalesce(jsonb_object_agg(id::text, round(public._crew_value(stats, c.period, c.period_key, c.metric))), '{}'::jsonb),
           coalesce(sum(public._crew_value(stats, c.period, c.period_key, c.metric)), 0)
      into v_vals, v_total
      from public.crew_members where crew = c.crew;
    v_winner := null; v_best := null; v_event := null;
    select id, public._crew_value(stats, c.period, c.period_key, c.metric) into v_winner, v_best
      from public.crew_members where crew = c.crew
     order by public._crew_value(stats, c.period, c.period_key, c.metric) desc, created_at
     limit 1;
    if coalesce(v_best, 0) <= 0 then v_winner := null; end if;
    v_done := c.kind = 'together' and v_total >= coalesce(c.target, 0);
    update public.crew_challenges
       set result = jsonb_build_object('values', v_vals, 'total', round(v_total), 'winner', v_winner, 'best', round(coalesce(v_best, 0)), 'done', v_done)
     where id = c.id;
    v_poster := coalesce(case when c.kind = 'versus' then v_winner end, c.created_by,
                         (select id from public.crew_members where crew = c.crew order by created_at limit 1));
    if v_poster is null then continue; end if;
    insert into public.crew_events (crew, member_id, client_id, kind, payload)
    values (c.crew, v_poster, 'cc-' || c.id, 'crewChallenge', jsonb_build_object(
      'challengeId', c.id, 'title', c.title, 'kind', c.kind, 'metric', c.metric, 'period', c.period,
      'periodKey', c.period_key, 'target', c.target, 'total', round(v_total), 'winner', v_winner,
      'best', round(coalesce(v_best, 0)), 'done', v_done, 'values', v_vals))
    on conflict (member_id, client_id) do nothing
    returning id into v_event;
    if v_event is not null then perform public._crew_push('post', v_event::text); end if;
  end loop;
end $$;

-- ── The board ───────────────────────────────────────────────

create or replace function public.crew_board(p_member uuid, p_key text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  m public.crew_members := public._crew_auth(p_member, p_key);
  v_week text := public._crew_week();
begin
  perform public._crew_fix_owner(m.crew);
  perform public._crew_settle(m.crew);
  return json_build_object(
    'crew', m.crew,
    'week', v_week,
    'month', public._crew_month(),
    'members', coalesce((
      select json_agg(json_build_object('id', id, 'name', name, 'stats', stats, 'updated_at', updated_at, 'owner', is_owner) order by created_at)
        from public.crew_members where crew = m.crew), '[]'::json),
    'events', coalesce((
      select json_agg(e) from (
        select ev.id, ev.member_id, ev.kind, ev.payload, ev.reactions, ev.created_at,
               (select count(*) from public.crew_comments c where c.event_id = ev.id) as comments,
               (select json_build_object('member_id', c.member_id, 'body', left(c.body, 140))
                  from public.crew_comments c where c.event_id = ev.id order by c.created_at desc limit 1) as last_comment
          from public.crew_events ev
         where ev.crew = m.crew and ev.created_at > now() - interval '30 days'
         order by ev.created_at desc
         limit 60) e), '[]'::json),
    'plans', coalesce((
      select json_agg(p) from (
        select id, member_id, client_id, name, summary, updated_at
          from public.crew_plans where crew = m.crew order by updated_at desc) p), '[]'::json),
    'challenges', coalesce((
      select json_agg(c) from (
        select id, created_by, kind, metric, period, period_key, target, title, result, created_at
          from public.crew_challenges
         where crew = m.crew and (result is null or created_at > now() - interval '45 days')
         order by created_at desc limit 20) c), '[]'::json),
    'nudgesIn', coalesce((select json_agg(from_id) from public.crew_nudges where to_id = m.id and week = v_week), '[]'::json),
    'nudgesOut', coalesce((select json_agg(to_id) from public.crew_nudges where from_id = m.id and week = v_week), '[]'::json)
  );
end $$;

-- ── Notifications ───────────────────────────────────────────

-- The phone's push token and which notifications it wants
create or replace function public.crew_set_push(p_member uuid, p_key text, p_token text, p_prefs jsonb, p_lang text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  m public.crew_members := public._crew_auth(p_member, p_key);
  v_token text := nullif(trim(coalesce(p_token, '')), '');
begin
  update public.crew_members
     set push_token = v_token,
         push_prefs = coalesce(p_prefs, '{}'::jsonb),
         lang = case when p_lang in ('en', 'es') then p_lang else 'en' end
   where id = m.id;
  -- A phone belongs to one member
  if v_token is not null then
    update public.crew_members set push_token = null where push_token = v_token and id <> m.id;
  end if;
end $$;

-- What to send for something that just happened: [{ token, title, body, channel, route, tag }]
-- Called by the crew-push Edge Function. Each notification goes out once, and only for real events.
create or replace function public.crew_push_job(p_kind text, p_ref text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_parts text[] := string_to_array(coalesce(p_ref, ''), '|');
  e public.crew_events;
  a public.crew_members;
  r public.crew_members;
  cm public.crew_comments;
  ch public.crew_challenges;
  v_es boolean;
  v_title text;
  v_body text;
  v_channel text;
  v_n int;
  v_what text;
  v_route text;
  v_at timestamptz;
  v_lead public.crew_members;
  v_lead_w int;
  v_rank int;
  v_count int;
  v_w int;
  v_word text;
begin
  if p_kind = 'post' then
    if p_ref !~ '^[0-9]{1,18}$' then return v_out; end if;
    select * into e from public.crew_events where id = p_ref::bigint and created_at > now() - interval '2 hours';
    if not found then return v_out; end if;
    if not public._crew_once('post:' || p_ref) then return v_out; end if;
    select * into a from public.crew_members where id = e.member_id;
    v_route := '/crew/post/' || e.id;
    -- Everyone else (a crew challenge's result goes to everyone, including whoever it's posted as)
    for r in select * from public.crew_members
              where crew = e.crew and (id <> e.member_id or e.kind = 'crewChallenge') and push_token is not null loop
      v_es := r.lang = 'es';
      v_channel := null;
      if e.kind = 'workout' then
        v_n := coalesce(jsonb_array_length(e.payload -> 'prs'), 0);
        if v_n > 0 and public._crew_pref(r.push_prefs, 'records') then v_channel := 'crew_records';
        elsif public._crew_pref(r.push_prefs, 'workouts') then v_channel := 'crew_workouts';
        end if;
        v_what := coalesce(case when v_es then nullif(e.payload ->> 'dayNameEs', '') end, nullif(e.payload ->> 'dayName', ''),
                           case when v_es then 'un entrenamiento' else 'a workout' end);
        v_title := case when v_es then a.name || ' terminó ' || v_what else a.name || ' finished ' || v_what end;
        v_body := round(coalesce((e.payload ->> 'minutes')::numeric, 0)) || ' min · '
          || coalesce(e.payload ->> 'sets', '0') || case when v_es then ' series' else ' sets' end
          || case when v_n = 1 then case when v_es then ' · 1 récord 🏆' else ' · 1 record 🏆' end
                  when v_n > 1 then ' · ' || v_n || case when v_es then ' récords 🏆' else ' records 🏆' end
                  else '' end;
      elsif e.kind = 'challenge' and public._crew_pref(r.push_prefs, 'challenges') then
        v_channel := 'crew_challenges';
        v_title := case when v_es then a.name || ' completó el reto del mes' else a.name || ' completed the monthly challenge' end;
        v_body := coalesce(case when v_es then e.payload #>> '{es,title}' end, e.payload ->> 'title', '');
      elsif e.kind = 'badge' and public._crew_pref(r.push_prefs, 'challenges') then
        v_channel := 'crew_challenges';
        v_title := case when v_es then a.name || ' consiguió una insignia 🏅' else a.name || ' earned a badge 🏅' end;
        v_body := coalesce(case when v_es then e.payload #>> '{es,title}' end, e.payload ->> 'title', '');
      elsif e.kind = 'crewChallenge' and public._crew_pref(r.push_prefs, 'challenges') then
        v_channel := 'crew_challenges';
        v_title := case when v_es then 'Reto del grupo terminado: ' else 'Crew challenge over: ' end || (e.payload ->> 'title');
        v_word := case e.payload ->> 'metric'
          when 'workouts' then case when v_es then ' entrenamientos' else ' workouts' end
          when 'sets' then case when v_es then ' series' else ' sets' end
          else ' kg' end;
        if e.payload ->> 'kind' = 'together' then
          v_body := case
            when (e.payload ->> 'done')::boolean then
              case when v_es then '¡Conseguido! ' else 'Done together! ' end || (e.payload ->> 'total') || ' / ' || (e.payload ->> 'target') || v_word
            else
              case when v_es then 'Os quedasteis en ' else 'Finished at ' end || (e.payload ->> 'total') || ' / ' || (e.payload ->> 'target') || v_word
            end;
        elsif e.payload ->> 'winner' is not null then
          v_body := coalesce((select name from public.crew_members where id = (e.payload ->> 'winner')::uuid), '?')
            || case when v_es then ' ganó con ' else ' won with ' end || (e.payload ->> 'best') || v_word;
        else
          v_body := case when v_es then 'Nadie puntuó' else 'Nobody scored' end;
        end if;
      end if;
      if v_channel is not null then
        v_out := v_out || jsonb_build_array(public._crew_msg(r, v_title, v_body, v_channel, v_route, 'post-' || e.id));
      end if;
    end loop;

  elsif p_kind = 'react' then
    if array_length(v_parts, 1) <> 2 or v_parts[1] !~ '^[0-9]{1,18}$' then return v_out; end if;
    select * into e from public.crew_events where id = v_parts[1]::bigint;
    if not found or not (e.reactions ? v_parts[2]) then return v_out; end if;
    select * into a from public.crew_members where id::text = v_parts[2] and crew = e.crew;
    if not found then return v_out; end if;
    select * into r from public.crew_members where id = e.member_id;
    if r.push_token is null or not public._crew_pref(r.push_prefs, 'reactions') then return v_out; end if;
    if not public._crew_once('react:' || p_ref) then return v_out; end if;
    v_es := r.lang = 'es';
    v_what := case e.reactions ->> v_parts[2] when 'fire' then '🔥' when 'strong' then '💪' when 'laugh' then '😂' else '👏' end;
    v_title := a.name || case when v_es then ' reaccionó ' else ' reacted ' end || v_what;
    v_body := case when e.kind = 'workout'
      then case when v_es then 'A tu entrenamiento: ' else 'To your workout: ' end
           || coalesce(case when v_es then nullif(e.payload ->> 'dayNameEs', '') end, e.payload ->> 'dayName', '')
      else case when v_es then 'A tu publicación' else 'To your post' end end;
    v_out := jsonb_build_array(public._crew_msg(r, v_title, v_body, 'crew_reactions', '/crew/post/' || e.id, 'react-' || e.id));

  elsif p_kind = 'comment' then
    if p_ref !~ '^[0-9]{1,18}$' then return v_out; end if;
    select * into cm from public.crew_comments where id = p_ref::bigint and created_at > now() - interval '2 hours';
    if not found then return v_out; end if;
    if not public._crew_once('comment:' || p_ref) then return v_out; end if;
    select * into e from public.crew_events where id = cm.event_id;
    select * into a from public.crew_members where id = cm.member_id;
    -- The post's author and everyone else in the thread
    for r in select * from public.crew_members
              where crew = cm.crew and id <> cm.member_id and push_token is not null
                and (id = e.member_id or id in (select member_id from public.crew_comments where event_id = cm.event_id and id < cm.id))
    loop
      if not public._crew_pref(r.push_prefs, 'comments') then continue; end if;
      v_es := r.lang = 'es';
      v_title := case
        when r.id = e.member_id then a.name || case when v_es then ' comentó tu publicación' else ' commented on your post' end
        when cm.member_id = e.member_id then a.name || case when v_es then ' respondió en su publicación' else ' replied on their post' end
        else a.name || case when v_es then ' respondió en la publicación de ' else ' replied on ' end
             || coalesce((select name from public.crew_members where id = e.member_id), '?')
             || case when v_es then '' else '''s post' end
        end;
      v_out := v_out || jsonb_build_array(public._crew_msg(r, v_title, left(cm.body, 160), 'crew_comments', '/crew/post/' || e.id, 'comments-' || e.id));
    end loop;

  elsif p_kind = 'live' then
    if array_length(v_parts, 1) <> 2 then return v_out; end if;
    select * into a from public.crew_members where id::text = v_parts[1];
    if not found or a.stats #>> '{live,startedAt}' is distinct from v_parts[2] then return v_out; end if;
    begin v_at := v_parts[2]::timestamptz; exception when others then return v_out; end;
    if v_at < now() - interval '3 hours' or v_at > now() + interval '10 minutes' then return v_out; end if;
    if not public._crew_once('live:' || p_ref) then return v_out; end if;
    for r in select * from public.crew_members where crew = a.crew and id <> a.id and push_token is not null loop
      if not public._crew_pref(r.push_prefs, 'live') then continue; end if;
      v_es := r.lang = 'es';
      v_title := a.name || case when v_es then ' está entrenando 🏋️' else ' is training now 🏋️' end;
      v_body := coalesce(case when v_es then nullif(a.stats #>> '{live,dayNameEs}', '') end, nullif(a.stats #>> '{live,dayName}', ''), '');
      v_out := v_out || jsonb_build_array(public._crew_msg(r, v_title, v_body, 'crew_live', '/crew', 'live-' || a.id));
    end loop;

  elsif p_kind = 'nudge' then
    if array_length(v_parts, 1) <> 3 then return v_out; end if;
    if not exists (select 1 from public.crew_nudges where from_id::text = v_parts[1] and to_id::text = v_parts[2] and week = v_parts[3]) then
      return v_out;
    end if;
    select * into a from public.crew_members where id::text = v_parts[1];
    select * into r from public.crew_members where id::text = v_parts[2];
    if r.push_token is null or not public._crew_pref(r.push_prefs, 'nudges') then return v_out; end if;
    if not public._crew_once('nudge:' || p_ref) then return v_out; end if;
    v_es := r.lang = 'es';
    v_out := jsonb_build_array(public._crew_msg(r,
      a.name || case when v_es then ' te da un toque 👋' else ' nudged you 👋' end,
      case when v_es then '¿Cae un entrenamiento esta semana?' else 'Time for a workout this week?' end,
      'crew_nudges', '/crew', 'nudge-' || a.id));

  elsif p_kind = 'challenge' then
    if p_ref !~ '^[0-9]{1,18}$' then return v_out; end if;
    select * into ch from public.crew_challenges where id = p_ref::bigint and created_at > now() - interval '2 hours' and result is null;
    if not found then return v_out; end if;
    if not public._crew_once('challenge:' || p_ref) then return v_out; end if;
    select * into a from public.crew_members where id = ch.created_by;
    for r in select * from public.crew_members where crew = ch.crew and id is distinct from ch.created_by and push_token is not null loop
      if not public._crew_pref(r.push_prefs, 'challenges') then continue; end if;
      v_es := r.lang = 'es';
      v_title := case when v_es then 'Nuevo reto del grupo' else 'New crew challenge' end
        || case when a.name is not null then case when v_es then ' de ' else ' from ' end || a.name else '' end;
      v_out := v_out || jsonb_build_array(public._crew_msg(r, v_title, ch.title, 'crew_challenges', '/crew', 'challenge-' || ch.id));
    end loop;

  elsif p_kind = 'recap' then
    -- Sunday evening only, for this week
    if array_length(v_parts, 1) <> 2 or v_parts[2] <> public._crew_week() then return v_out; end if;
    if not public._crew_recap_time() then return v_out; end if;
    select count(*) into v_count from public.crew_members
     where crew = v_parts[1] and stats #>> '{week,key}' = v_parts[2] and coalesce((stats #>> '{week,workouts}')::int, 0) > 0;
    if v_count = 0 then return v_out; end if;
    if not public._crew_once('recap:' || p_ref) then return v_out; end if;
    select * into v_lead from public.crew_members
     where crew = v_parts[1] and stats #>> '{week,key}' = v_parts[2]
     order by coalesce((stats #>> '{week,workouts}')::int, 0) desc, coalesce((stats #>> '{week,sets}')::int, 0) desc, created_at
     limit 1;
    v_lead_w := coalesce((v_lead.stats #>> '{week,workouts}')::int, 0);
    for r in select * from public.crew_members where crew = v_parts[1] and push_token is not null loop
      if not public._crew_pref(r.push_prefs, 'recap') then continue; end if;
      v_es := r.lang = 'es';
      v_w := case when r.stats #>> '{week,key}' = v_parts[2] then coalesce((r.stats #>> '{week,workouts}')::int, 0) else 0 end;
      select count(*) + 1 into v_rank from public.crew_members x
       where x.crew = v_parts[1] and x.stats #>> '{week,key}' = v_parts[2]
         and (coalesce((x.stats #>> '{week,workouts}')::int, 0) > v_w
           or (coalesce((x.stats #>> '{week,workouts}')::int, 0) = v_w
               and coalesce((x.stats #>> '{week,sets}')::int, 0) > coalesce((r.stats #>> '{week,sets}')::int, 0)));
      v_body := case
        when r.id = v_lead.id then
          case when v_es then 'Lideraste el grupo con ' || v_w || ' entrenamientos 👑' else 'You led the crew with ' || v_w || ' workouts 👑' end
        when v_w > 0 then
          case when v_es then 'Quedaste ' || public._crew_ord(v_rank, true) || ' de ' || v_count || ' con ' || v_w || ' entrenamientos. ' || v_lead.name || ' lideró con ' || v_lead_w || '.'
               else 'You finished ' || public._crew_ord(v_rank, false) || ' of ' || v_count || ' with ' || v_w || ' workouts. ' || v_lead.name || ' led with ' || v_lead_w || '.' end
        else
          case when v_es then v_lead.name || ' lideró con ' || v_lead_w || ' entrenamientos. Semana nueva, a por ello.'
               else v_lead.name || ' led with ' || v_lead_w || ' workouts. New week, fresh start.' end
        end;
      v_out := v_out || jsonb_build_array(public._crew_msg(r,
        case when v_es then 'Tu semana en el grupo' else 'Your week in the crew' end, v_body, 'crew_recap', '/crew', 'recap'));
    end loop;
  end if;
  return v_out;
end $$;

-- A token Firebase says is gone (app uninstalled): stop sending to it
create or replace function public.crew_push_drop(p_token text)
returns void
language sql security definer set search_path = public, extensions as $$
  update public.crew_members set push_token = null where push_token = p_token
$$;

-- Sunday-evening recap for every crew that trained this week
create or replace function public._crew_recap_all()
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare c text;
begin
  for c in select distinct crew from public.crew_members
            where stats #>> '{week,key}' = public._crew_week() and coalesce((stats #>> '{week,workouts}')::int, 0) > 0
  loop
    perform public._crew_push('recap', c || '|' || public._crew_week());
  end loop;
end $$;

-- ── Scheduled jobs (pg_cron): close challenges every night, recap on Sundays ──
do $$ begin
  create extension if not exists pg_cron;
exception when others then raise notice 'pg_cron not available (no weekly recap): %', sqlerrm;
end $$;
do $$ begin
  perform cron.schedule('crew-settle', '15 0 * * *', 'select public._crew_settle()');
  perform cron.schedule('crew-recap', '0 17 * * 0', 'select public._crew_recap_all()'); -- 18:00/19:00 in Spain
exception when others then raise notice 'Crew jobs not scheduled: %', sqlerrm;
end $$;

-- ── Who can call what ───────────────────────────────────────
-- Internal helpers and the notification job: nobody from outside
revoke all on function public._crew_auth(uuid, text) from public, anon, authenticated;
revoke all on function public._crew_week(timestamptz) from public, anon, authenticated;
revoke all on function public._crew_month(timestamptz) from public, anon, authenticated;
revoke all on function public._crew_fix_owner(text) from public, anon, authenticated;
revoke all on function public._crew_value(jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public._crew_push(text, text) from public, anon, authenticated;
revoke all on function public._crew_once(text) from public, anon, authenticated;
revoke all on function public._crew_pref(jsonb, text) from public, anon, authenticated;
revoke all on function public._crew_recap_time() from public, anon, authenticated;
revoke all on function public._crew_ord(int, boolean) from public, anon, authenticated;
revoke all on function public._crew_msg(public.crew_members, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public._crew_settle(text) from public, anon, authenticated;
revoke all on function public._crew_recap_all() from public, anon, authenticated;
revoke all on function public.crew_push_job(text, text) from public, anon, authenticated;
revoke all on function public.crew_push_drop(text) from public, anon, authenticated;

-- The app's calls
do $$
declare f text;
begin
  foreach f in array array[
    'crew_join(text, text, text, boolean)',
    'crew_leave(uuid, text)',
    'crew_remove(uuid, text, uuid)',
    'crew_update(uuid, text, text, jsonb)',
    'crew_post(uuid, text, text, text, jsonb)',
    'crew_unpost(uuid, text, text)',
    'crew_react(uuid, text, bigint, text)',
    'crew_comment(uuid, text, bigint, text)',
    'crew_uncomment(uuid, text, bigint)',
    'crew_thread(uuid, text, bigint)',
    'crew_share_plan(uuid, text, text, text, jsonb, jsonb)',
    'crew_unshare_plan(uuid, text, text)',
    'crew_get_plan(uuid, text, uuid)',
    'crew_nudge(uuid, text, uuid)',
    'crew_challenge_create(uuid, text, text, text, text, numeric, text)',
    'crew_challenge_delete(uuid, text, bigint)',
    'crew_board(uuid, text)',
    'crew_set_push(uuid, text, text, jsonb, text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
