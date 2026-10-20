-- Gym Crew: crew board backend (Supabase free tier is plenty).
--
-- Run once: Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
-- Safe to run again after an app update (it only creates what's missing and replaces functions).
--
-- How it's locked down:
--   * The two tables have row level security on and NO policies, and the public roles have no
--     table rights, so the REST API can't read or write them directly.
--   * The app only calls the crew_* functions below. Each phone has a random secret key; the
--     database stores only its SHA-256 hash, and every write checks it.
--   * The crew code is the invite: only people who know it can join and see that crew.

create extension if not exists pgcrypto with schema extensions;

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

create table if not exists public.crew_events (
  id bigint generated always as identity primary key,
  crew text not null,
  member_id uuid not null references public.crew_members (id) on delete cascade,
  client_id text not null,
  kind text not null,
  payload jsonb not null,
  reactions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (member_id, client_id)
);
create index if not exists crew_events_crew_time on public.crew_events (crew, created_at desc);

alter table public.crew_members enable row level security;
alter table public.crew_events enable row level security;
revoke all on public.crew_members from anon, authenticated;
revoke all on public.crew_events from anon, authenticated;

-- Internal: check a member id + secret key, return the member row or fail.
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
  insert into public.crew_members (crew, name, key_hash)
  values (v_crew, v_name, encode(extensions.digest(p_key, 'sha256'), 'hex'))
  returning id into v_id;
  return json_build_object('member_id', v_id, 'crew', v_crew);
end $$;

create or replace function public.crew_update(p_member uuid, p_key text, p_name text, p_stats jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  if pg_column_size(p_stats) > 8000 then raise exception 'too_big'; end if;
  update public.crew_members
     set name = coalesce(nullif(left(trim(coalesce(p_name, '')), 30), ''), name),
         stats = coalesce(p_stats, stats),
         updated_at = now()
   where id = m.id;
end $$;

create or replace function public.crew_post(p_member uuid, p_key text, p_client_id text, p_kind text, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  if p_kind not in ('workout', 'challenge') then raise exception 'bad_kind'; end if;
  if pg_column_size(p_payload) > 8000 then raise exception 'too_big'; end if;
  insert into public.crew_events (crew, member_id, client_id, kind, payload)
  values (m.crew, m.id, left(p_client_id, 64), p_kind, p_payload)
  on conflict (member_id, client_id) do update set kind = excluded.kind, payload = excluded.payload;
  -- Keep the feed small: drop anything older than 90 days
  delete from public.crew_events where crew = m.crew and created_at < now() - interval '90 days';
end $$;

create or replace function public.crew_unpost(p_member uuid, p_key text, p_client_id text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  delete from public.crew_events where member_id = m.id and client_id = p_client_id;
end $$;

-- High five: toggles your reaction on someone's post
create or replace function public.crew_react(p_member uuid, p_key text, p_event bigint)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  update public.crew_events
     set reactions = case when reactions ? m.id::text then reactions - m.id::text
                          else reactions || jsonb_build_object(m.id::text, true) end
   where id = p_event and crew = m.crew;
end $$;

create or replace function public.crew_leave(p_member uuid, p_key text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  delete from public.crew_members where id = m.id; -- their posts go with them
end $$;

create or replace function public.crew_board(p_member uuid, p_key text)
returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare m public.crew_members := public._crew_auth(p_member, p_key);
begin
  return json_build_object(
    'crew', m.crew,
    'members', coalesce((
      select json_agg(json_build_object('id', id, 'name', name, 'stats', stats, 'updated_at', updated_at) order by created_at)
        from public.crew_members where crew = m.crew), '[]'::json),
    'events', coalesce((
      select json_agg(e) from (
        select id, member_id, kind, payload, reactions, created_at
          from public.crew_events
         where crew = m.crew and created_at > now() - interval '30 days'
         order by created_at desc
         limit 60) e), '[]'::json)
  );
end $$;

-- Only the crew_* functions are callable from the app
revoke all on function public._crew_auth(uuid, text) from public, anon, authenticated;
revoke all on function public.crew_join(text, text, text, boolean) from public;
revoke all on function public.crew_update(uuid, text, text, jsonb) from public;
revoke all on function public.crew_post(uuid, text, text, text, jsonb) from public;
revoke all on function public.crew_unpost(uuid, text, text) from public;
revoke all on function public.crew_react(uuid, text, bigint) from public;
revoke all on function public.crew_leave(uuid, text) from public;
revoke all on function public.crew_board(uuid, text) from public;
grant execute on function public.crew_join(text, text, text, boolean) to anon, authenticated;
grant execute on function public.crew_update(uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.crew_post(uuid, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.crew_unpost(uuid, text, text) to anon, authenticated;
grant execute on function public.crew_react(uuid, text, bigint) to anon, authenticated;
grant execute on function public.crew_leave(uuid, text) to anon, authenticated;
grant execute on function public.crew_board(uuid, text) to anon, authenticated;
