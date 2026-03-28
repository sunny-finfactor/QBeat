create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid not null,
  status text not null default 'active' check (status in ('active', 'expired', 'closed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_activity_at timestamptz not null default timezone('utc', now())
);

alter table public.rooms add column if not exists code text;
alter table public.rooms add column if not exists id uuid default gen_random_uuid();
alter table public.rooms add column if not exists host_user_id uuid;
alter table public.rooms add column if not exists status text default 'active';
alter table public.rooms add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.rooms add column if not exists updated_at timestamptz default timezone('utc', now());
alter table public.rooms add column if not exists last_activity_at timestamptz default timezone('utc', now());

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  nickname text not null,
  role text not null default 'listener' check (role in ('host', 'listener')),
  joined_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, user_id)
);

alter table public.room_members add column if not exists user_id uuid;
alter table public.room_members add column if not exists room_id uuid;
alter table public.room_members add column if not exists nickname text;
alter table public.room_members add column if not exists role text default 'listener';
alter table public.room_members add column if not exists joined_at timestamptz default timezone('utc', now());
alter table public.room_members add column if not exists last_seen_at timestamptz default timezone('utc', now());

create table if not exists public.room_tracks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  provider text not null default 'youtube' check (provider in ('youtube', 'spotify')),
  provider_track_id text not null,
  title text not null,
  artist text not null,
  thumbnail_url text not null,
  duration_seconds integer,
  status text not null check (status in ('currently_playing', 'up_next', 'queued', 'played')),
  vote_count integer not null default 0,
  added_by uuid not null,
  added_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  finished_at timestamptz
);

alter table public.room_tracks add column if not exists provider text default 'youtube';
alter table public.room_tracks add column if not exists id uuid default gen_random_uuid();
alter table public.room_tracks add column if not exists room_id uuid;
alter table public.room_tracks add column if not exists provider_track_id text;
alter table public.room_tracks add column if not exists title text;
alter table public.room_tracks add column if not exists artist text;
alter table public.room_tracks add column if not exists thumbnail_url text;
alter table public.room_tracks add column if not exists duration_seconds integer;
alter table public.room_tracks add column if not exists status text;
alter table public.room_tracks add column if not exists vote_count integer default 0;
alter table public.room_tracks add column if not exists added_by uuid;
alter table public.room_tracks add column if not exists added_at timestamptz default timezone('utc', now());
alter table public.room_tracks add column if not exists started_at timestamptz;
alter table public.room_tracks add column if not exists finished_at timestamptz;

create table if not exists public.track_votes (
  room_id uuid not null references public.rooms(id) on delete cascade,
  room_track_id uuid not null references public.room_tracks(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (room_track_id, user_id)
);

alter table public.track_votes add column if not exists room_id uuid;
alter table public.track_votes add column if not exists room_track_id uuid;
alter table public.track_votes add column if not exists user_id uuid;
alter table public.track_votes add column if not exists created_at timestamptz default timezone('utc', now());

create table if not exists public.playback_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  current_track_id uuid references public.room_tracks(id) on delete set null,
  is_playing boolean not null default false,
  position_seconds numeric not null default 0,
  sync_anchor_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid
);

alter table public.playback_state add column if not exists current_track_id uuid;
alter table public.playback_state add column if not exists room_id uuid;
alter table public.playback_state add column if not exists is_playing boolean default false;
alter table public.playback_state add column if not exists position_seconds numeric default 0;
alter table public.playback_state add column if not exists sync_anchor_at timestamptz default timezone('utc', now());
alter table public.playback_state add column if not exists updated_at timestamptz default timezone('utc', now());
alter table public.playback_state add column if not exists updated_by uuid;

create index if not exists room_tracks_room_id_status_idx on public.room_tracks (room_id, status);
create index if not exists room_tracks_room_id_votes_idx on public.room_tracks (room_id, vote_count desc, added_at asc);
create index if not exists track_votes_room_id_user_id_idx on public.track_votes (room_id, user_id);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_tracks enable row level security;
alter table public.track_votes enable row level security;
alter table public.playback_state enable row level security;

drop policy if exists "rooms_select_for_members" on public.rooms;
drop policy if exists "room_members_select_for_members" on public.room_members;
drop policy if exists "room_tracks_select_for_members" on public.room_tracks;
drop policy if exists "track_votes_select_for_owner" on public.track_votes;
drop policy if exists "playback_state_select_for_members" on public.playback_state;

create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = target_room_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_room_host(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms
    where id = target_room_id
      and host_user_id = auth.uid()
  );
$$;

create policy "rooms_select_for_members"
on public.rooms
for select
using (public.is_room_member(id));

create policy "room_members_select_for_members"
on public.room_members
for select
using (public.is_room_member(room_id));

create policy "room_tracks_select_for_members"
on public.room_tracks
for select
using (public.is_room_member(room_id));

create policy "track_votes_select_for_owner"
on public.track_votes
for select
using (user_id = auth.uid() and public.is_room_member(room_id));

create policy "playback_state_select_for_members"
on public.playback_state
for select
using (public.is_room_member(room_id));

create or replace function public.touch_room_activity(target_room_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rooms
  set updated_at = timezone('utc', now()),
      last_activity_at = timezone('utc', now())
  where id = target_room_id
    and status = 'active';
$$;

create or replace function public.rebalance_up_next(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_id uuid;
begin
  update public.room_tracks
  set status = 'queued'
  where room_id = target_room_id
    and status = 'up_next';

  select id
  into candidate_id
  from public.room_tracks
  where room_id = target_room_id
    and status = 'queued'
  order by vote_count desc, added_at asc
  limit 1;

  if candidate_id is not null then
    update public.room_tracks
    set status = 'up_next'
    where id = candidate_id;
  end if;
end;
$$;

create or replace function public.advance_room_queue(target_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_track_id uuid;
begin
  update public.room_tracks
  set status = 'played',
      finished_at = timezone('utc', now())
  where room_id = target_room_id
    and status = 'currently_playing';

  update public.room_tracks
  set status = 'queued'
  where room_id = target_room_id
    and status = 'up_next';

  select id
  into next_track_id
  from public.room_tracks
  where room_id = target_room_id
    and status = 'queued'
  order by vote_count desc, added_at asc
  limit 1;

  if next_track_id is null then
    update public.playback_state
    set current_track_id = null,
        is_playing = false,
        position_seconds = 0,
        sync_anchor_at = timezone('utc', now()),
        updated_at = timezone('utc', now()),
        updated_by = auth.uid()
    where room_id = target_room_id;

    perform public.touch_room_activity(target_room_id);
    return null;
  end if;

  update public.room_tracks
  set status = 'currently_playing',
      started_at = coalesce(started_at, timezone('utc', now()))
  where id = next_track_id;

  update public.playback_state
  set current_track_id = next_track_id,
      is_playing = true,
      position_seconds = 0,
      sync_anchor_at = timezone('utc', now()),
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where room_id = target_room_id;

  perform public.rebalance_up_next(target_room_id);
  perform public.touch_room_activity(target_room_id);

  return next_track_id;
end;
$$;

create or replace function public.create_room(p_nickname text)
returns table (room_id uuid, room_code text, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_room public.rooms%rowtype;
  generated_code text;
  clean_nickname text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clean_nickname := coalesce(nullif(trim(p_nickname), ''), 'Guest');

  loop
    generated_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));

    begin
      insert into public.rooms (code, host_user_id)
      values (generated_code, auth.uid())
      returning *
      into created_room;

      exit;
    exception
      when unique_violation then
        generated_code := null;
    end;
  end loop;

  insert into public.room_members (room_id, user_id, nickname, role)
  values (created_room.id, auth.uid(), clean_nickname, 'host');

  insert into public.playback_state (room_id, updated_by)
  values (created_room.id, auth.uid());

  return query
  select created_room.id, created_room.code, 'host'::text;
end;
$$;

create or replace function public.join_room(p_code text, p_nickname text)
returns table (room_id uuid, room_code text, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.rooms%rowtype;
  clean_nickname text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clean_nickname := coalesce(nullif(trim(p_nickname), ''), 'Guest');

  update public.rooms
  set status = 'expired',
      updated_at = timezone('utc', now())
  where status = 'active'
    and last_activity_at < timezone('utc', now()) - interval '2 hours';

  select *
  into target_room
  from public.rooms
  where upper(code) = upper(trim(p_code))
    and status = 'active'
  limit 1;

  if target_room.id is null then
    raise exception 'Room not found or expired';
  end if;

  insert into public.room_members (room_id, user_id, nickname, role)
  values (
    target_room.id,
    auth.uid(),
    clean_nickname,
    case when target_room.host_user_id = auth.uid() then 'host' else 'listener' end
  )
  on conflict on constraint room_members_pkey
  do update
  set nickname = excluded.nickname,
      last_seen_at = timezone('utc', now());

  perform public.touch_room_activity(target_room.id);

  return query
  select
    target_room.id,
    target_room.code,
    case when target_room.host_user_id = auth.uid() then 'host' else 'listener' end::text;
end;
$$;

create or replace function public.add_track_to_room(
  p_room_id uuid,
  p_provider text,
  p_provider_track_id text,
  p_title text,
  p_artist text,
  p_thumbnail_url text,
  p_duration_seconds integer default null
)
returns public.room_tracks
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_track public.room_tracks%rowtype;
  has_current boolean;
  has_up_next boolean;
  next_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room';
  end if;

  perform public.touch_room_activity(p_room_id);

  select exists (
    select 1 from public.room_tracks
    where room_id = p_room_id
      and status = 'currently_playing'
  ) into has_current;

  select exists (
    select 1 from public.room_tracks
    where room_id = p_room_id
      and status = 'up_next'
  ) into has_up_next;

  next_status := case
    when not has_current then 'currently_playing'
    when not has_up_next then 'up_next'
    else 'queued'
  end;

  insert into public.room_tracks (
    room_id,
    provider,
    provider_track_id,
    title,
    artist,
    thumbnail_url,
    duration_seconds,
    status,
    added_by,
    started_at
  )
  values (
    p_room_id,
    p_provider,
    p_provider_track_id,
    p_title,
    p_artist,
    p_thumbnail_url,
    p_duration_seconds,
    next_status,
    auth.uid(),
    case when next_status = 'currently_playing' then timezone('utc', now()) else null end
  )
  returning *
  into inserted_track;

  if next_status = 'currently_playing' then
    update public.playback_state
    set current_track_id = inserted_track.id,
        is_playing = true,
        position_seconds = 0,
        sync_anchor_at = timezone('utc', now()),
        updated_at = timezone('utc', now()),
        updated_by = auth.uid()
    where room_id = p_room_id;
  else
    perform public.rebalance_up_next(p_room_id);
  end if;

  return inserted_track;
end;
$$;

create or replace function public.upvote_track(p_room_track_id uuid)
returns table (applied boolean, room_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_track public.room_tracks%rowtype;
  inserted_votes integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_track
  from public.room_tracks
  where id = p_room_track_id
  limit 1;

  if target_track.id is null then
    raise exception 'Track not found';
  end if;

  if not public.is_room_member(target_track.room_id) then
    raise exception 'You are not a member of this room';
  end if;

  if target_track.status not in ('up_next', 'queued') then
    raise exception 'Only up next and queued tracks can be upvoted';
  end if;

  insert into public.track_votes (room_id, room_track_id, user_id)
  values (target_track.room_id, target_track.id, auth.uid())
  on conflict do nothing;

  get diagnostics inserted_votes = row_count;

  if inserted_votes = 0 then
    return query select false, target_track.room_id;
    return;
  end if;

  update public.room_tracks
  set vote_count = vote_count + 1
  where id = target_track.id;

  perform public.rebalance_up_next(target_track.room_id);
  perform public.touch_room_activity(target_track.room_id);

  return query select true, target_track.room_id;
end;
$$;

create or replace function public.remove_track_from_room(p_room_track_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_track public.room_tracks%rowtype;
begin
  select *
  into target_track
  from public.room_tracks
  where id = p_room_track_id
  limit 1;

  if target_track.id is null then
    raise exception 'Track not found';
  end if;

  if not public.is_room_host(target_track.room_id) then
    raise exception 'Only the host can remove tracks';
  end if;

  if target_track.status not in ('up_next', 'queued') then
    raise exception 'Only up next and queued tracks can be removed';
  end if;

  delete from public.room_tracks
  where id = target_track.id;

  perform public.rebalance_up_next(target_track.room_id);
  perform public.touch_room_activity(target_track.room_id);
end;
$$;

create or replace function public.skip_current_track(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_room_host(p_room_id) then
    raise exception 'Only the host can skip tracks';
  end if;

  return public.advance_room_queue(p_room_id);
end;
$$;

create or replace function public.set_room_playback(
  p_room_id uuid,
  p_action text,
  p_position_seconds numeric default null
)
returns public.playback_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state public.playback_state%rowtype;
  updated_state public.playback_state%rowtype;
begin
  if not public.is_room_host(p_room_id) then
    raise exception 'Only the host can control playback';
  end if;

  select *
  into current_state
  from public.playback_state
  where room_id = p_room_id;

  if current_state.room_id is null then
    raise exception 'Playback state not found';
  end if;

  case p_action
    when 'pause' then
      update public.playback_state
      set is_playing = false,
          position_seconds = coalesce(p_position_seconds, current_state.position_seconds),
          sync_anchor_at = timezone('utc', now()),
          updated_at = timezone('utc', now()),
          updated_by = auth.uid()
      where room_id = p_room_id;
    when 'resume' then
      update public.playback_state
      set is_playing = true,
          position_seconds = coalesce(p_position_seconds, current_state.position_seconds),
          sync_anchor_at = timezone('utc', now()),
          updated_at = timezone('utc', now()),
          updated_by = auth.uid()
      where room_id = p_room_id;
    when 'seek' then
      update public.playback_state
      set position_seconds = coalesce(p_position_seconds, 0),
          sync_anchor_at = timezone('utc', now()),
          updated_at = timezone('utc', now()),
          updated_by = auth.uid()
      where room_id = p_room_id;
    else
      raise exception 'Unsupported playback action';
  end case;

  perform public.touch_room_activity(p_room_id);

  select *
  into updated_state
  from public.playback_state
  where room_id = p_room_id;

  return updated_state;
end;
$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.rooms;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.room_members;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.room_tracks;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.playback_state;
  exception
    when duplicate_object then null;
  end;
end;
$$;
