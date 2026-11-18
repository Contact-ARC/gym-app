-- Gym Crew accounts (0.12): your data saved to your Google account, on any phone.
--
-- Run once, AFTER crew.sql: Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
-- Safe to run again after an app update: it only adds what's missing and replaces functions.
-- (Supabase may warn about "destructive operations" because of the drop policy / revoke lines:
-- they replace the photo rules below and touch no data.)
--
-- How it's locked down:
--   * Sign-in is Supabase Auth with Google. Every function below works only for a signed-in user,
--     and only ever on that user's own rows (auth.uid()).
--   * user_records has row level security on and no policies, and the public roles have no table
--     rights, so the REST API can't read or write it directly: only through sync_push / sync_pull.
--   * Progress photos go in a PRIVATE storage bucket, in a folder named after the user's id.
--     The policies below let each user see and change only their own folder.
--   * Whoever owns the Supabase project can still read everything in the dashboard. Tell your crew.

create extension if not exists pgcrypto with schema extensions;

-- ── Your data, one row per thing ─────────────────────────────
-- kind: session, body, photo, goal, plan, exercise, edit, machine, note, challenge, settings, profile, misc
-- at:   when the phone last changed it (ms since 1970); the newest change wins
-- rev:  the server's order of changes, so a phone can ask "what's new since rev N"
create sequence if not exists public.user_records_rev;
create table if not exists public.user_records (
  user_id uuid not null references auth.users (id) on delete cascade, -- deleting a user (here or in the dashboard) deletes their data
  kind text not null,
  id text not null,
  data jsonb,
  at bigint not null,
  deleted boolean not null default false,
  rev bigint not null default nextval('public.user_records_rev'),
  primary key (user_id, kind, id)
);
create index if not exists user_records_by_rev on public.user_records (user_id, rev);
alter table public.user_records enable row level security;
revoke all on public.user_records from anon, authenticated;
revoke all on sequence public.user_records_rev from anon, authenticated;

-- ── Sync ────────────────────────────────────────────────────
-- Send changes: [{ k: kind, i: id, d: data, a: at, x: deleted }]. A change older than what the server
-- already has is skipped (another phone changed it later); the phone picks up the newer one in sync_pull.
create or replace function public.sync_push(p_records jsonb)
returns json
language plpgsql security definer set search_path = public, auth as $$
declare
  v_user uuid := auth.uid();
  r jsonb;
  v_kind text; v_id text; v_at bigint; v_del boolean; v_data jsonb;
  v_applied int := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  -- A deleted account's sign-in stays valid for up to an hour on its other phones: stop them here
  if v_user is null or not exists (select 1 from auth.users where id = v_user) then raise exception 'not_signed_in'; end if;
  if jsonb_typeof(p_records) <> 'array' then raise exception 'bad_records'; end if;
  if jsonb_array_length(p_records) > 500 then raise exception 'too_many'; end if;
  for r in select * from jsonb_array_elements(p_records) loop
    v_kind := r->>'k';
    v_id := r->>'i';
    v_at := (r->>'a')::bigint;
    v_del := coalesce((r->>'x')::boolean, false);
    v_data := case when v_del then null else r->'d' end;
    if v_kind !~ '^[a-z]{1,20}$' or v_id is null or char_length(v_id) > 120 or v_at is null then raise exception 'bad_record'; end if;
    if v_data is not null and octet_length(v_data::text) > 1048576 then raise exception 'record_too_big'; end if;
    insert into public.user_records as u (user_id, kind, id, data, at, deleted)
    values (v_user, v_kind, v_id, v_data, v_at, v_del)
    on conflict (user_id, kind, id) do update
       set data = excluded.data, at = excluded.at, deleted = excluded.deleted, rev = nextval('public.user_records_rev')
     where u.at <= excluded.at;
    if found then v_applied := v_applied + 1;
    else v_skipped := v_skipped || jsonb_build_object('k', v_kind, 'i', v_id);
    end if;
  end loop;
  return json_build_object('applied', v_applied, 'skipped', v_skipped);
end $$;

-- Get changes since rev p_since, oldest first, at most p_limit (the phone asks again while "more").
create or replace function public.sync_pull(p_since bigint default 0, p_limit int default 400)
returns json
language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_user uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 400), 1), 1000);
  v_rows json;
  v_rev bigint;
  v_count int;
begin
  if v_user is null or not exists (select 1 from auth.users where id = v_user) then raise exception 'not_signed_in'; end if;
  with page as (
    select kind, id, data, at, deleted, rev from public.user_records
     where user_id = v_user and rev > coalesce(p_since, 0)
     order by rev
     limit v_limit + 1
  ), shown as (
    select * from page order by rev limit v_limit
  )
  select coalesce(json_agg(json_build_object('k', kind, 'i', id, 'd', data, 'a', at, 'x', deleted, 'r', rev) order by rev), '[]'::json),
         max(rev), (select count(*) from page)
    into v_rows, v_rev, v_count
    from shown;
  return json_build_object('records', v_rows, 'rev', coalesce(v_rev, p_since, 0), 'more', v_count > v_limit);
end $$;

-- What's saved, for the Account screen
create or replace function public.account_status()
returns json
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  return (
    select json_build_object(
      'workouts', count(*) filter (where kind = 'session' and not deleted),
      'photos', count(*) filter (where kind = 'photo' and not deleted),
      'records', count(*) filter (where not deleted),
      'bytes', coalesce(sum(octet_length(data::text)), 0),
      'rev', coalesce(max(rev), 0)
    )
    from public.user_records where user_id = v_user
  );
end $$;

-- Delete the account and everything saved in it. The app deletes the photos through the storage API
-- first (Supabase doesn't allow deleting files from SQL); the crew membership stays on the phones
-- that have it, just no longer tied to an account.
create or replace function public.account_delete()
returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  delete from public.user_records where user_id = v_user;
  -- Phones that got in through the account lose access; the phone that joined keeps it
  delete from public.crew_member_keys k using public.crew_members c where c.id = k.member and c.user_id = v_user;
  update public.crew_members set user_id = null where user_id = v_user;
  delete from auth.users where id = v_user;
  return true;
end $$;

-- ── Progress photos: a private bucket, one folder per user ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
   set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "progress photos: read own" on storage.objects;
drop policy if exists "progress photos: add own" on storage.objects;
drop policy if exists "progress photos: change own" on storage.objects;
drop policy if exists "progress photos: delete own" on storage.objects;
create policy "progress photos: read own" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "progress photos: add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "progress photos: change own" on storage.objects for update to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "progress photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- ── Who can call what: signed-in users only ─────────────────
do $$
declare f text;
begin
  foreach f in array array['sync_push(jsonb)', 'sync_pull(bigint, int)', 'account_status()', 'account_delete()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
