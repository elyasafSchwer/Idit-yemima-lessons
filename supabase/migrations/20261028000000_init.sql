-- ============================================================
-- Idit Lessons — MASTER DATABASE SCHEMA
-- Paste into Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

create type user_role     as enum ('admin', 'student');
create type track_kind    as enum ('full', 'summary');
create type lesson_status as enum ('draft', 'processing', 'ready', 'failed');

-- ------------------------------------------------------------------ profiles
create table profiles (
    id         uuid primary key references auth.users (id) on delete cascade,
    username   text not null unique,
    role       user_role not null default 'student',
    created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- lessons
create table lessons (
    id            uuid primary key default gen_random_uuid(),
    lesson_number int,
    title         text not null,
    description   text,
    lesson_date   date,
    -- Exactly one free lesson acts as the funnel; everything else is gated.
    is_free       boolean not null default false,
    status        lesson_status not null default 'draft',
    created_at    timestamptz not null default now()
);

-- -------------------------------------------------------------------- tracks
-- One lesson has up to two tracks: the lesson itself and its summary.
create table tracks (
    id               uuid primary key default gen_random_uuid(),
    lesson_id        uuid not null references lessons (id) on delete cascade,
    kind             track_kind not null,
    hls_prefix       text,
    duration_seconds int,
    segment_count    int,
    status           lesson_status not null default 'draft',
    created_at       timestamptz not null default now(),
    unique (lesson_id, kind)
);

-- ---------------------------------------------------------------- track_keys
-- AES-128 key material. Deliberately a SEPARATE table that gets ZERO policies:
-- with RLS enabled and no policy, every role is denied and only service_role
-- (which bypasses RLS) can read it. Keeping this out of `tracks` means a future
-- mistake in a `tracks` select policy cannot leak the keys.
create table track_keys (
    track_id   uuid primary key references tracks (id) on delete cascade,
    key_bytes  bytea not null,
    key_iv     text  not null,
    created_at timestamptz not null default now()
);

-- -------------------------------------------------------------- entitlements
-- A grant history rather than a single column, so Idit can see renewals and
-- how each year was paid for.
create table entitlements (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references auth.users (id) on delete cascade,
    starts_at  timestamptz not null default now(),
    expires_at timestamptz not null,
    granted_by uuid references auth.users (id) on delete set null,
    method     text,
    amount     numeric(10, 2),
    note       text,
    created_at timestamptz not null default now()
);

-- --------------------------------------------------------- playback_sessions
-- Minted by the `playback-session` Edge Function after the entitlement check;
-- the token then authorises the manifest and the key request. Service-role only.
create table playback_sessions (
    token      text primary key,
    user_id    uuid not null references auth.users (id) on delete cascade,
    track_id   uuid not null references tracks (id) on delete cascade,
    key_serves int not null default 0,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

-- --------------------------------------------------------- playback_progress
create table playback_progress (
    user_id          uuid not null references auth.users (id) on delete cascade,
    track_id         uuid not null references tracks (id) on delete cascade,
    position_seconds int  not null default 0,
    updated_at       timestamptz not null default now(),
    primary key (user_id, track_id)
);

-- ---------------------------------------------------------------- ingest_jobs
create table ingest_jobs (
    id         uuid primary key default gen_random_uuid(),
    lesson_id  uuid references lessons (id) on delete cascade,
    kind       track_kind not null,
    parts      jsonb not null default '[]'::jsonb,
    status     lesson_status not null default 'processing',
    error      text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index on tracks (lesson_id);
create index on entitlements (user_id, expires_at desc);
create index on playback_sessions (expires_at);
create index on ingest_jobs (lesson_id, created_at desc);
create index on lessons (lesson_date desc);

-- =================================================================== functions

create or replace function public.is_admin(uid uuid)
    returns boolean language sql stable
    security definer set search_path = ''
as $$
select exists (select 1
               from public.profiles
               where id = uid
                 and role = 'admin');
$$;

create or replace function public.has_active_access(uid uuid)
    returns boolean language sql stable
    security definer set search_path = ''
as $$
select public.is_admin(uid)
    or exists (select 1
               from public.entitlements
               where user_id = uid
                 and now() between starts_at and expires_at);
$$;

-- Everyone starts as a student. Idit is promoted once, by hand, after she signs
-- up -- see README. Without that step nobody can grant access to anyone.
create or replace function public.handle_new_user()
    returns trigger language plpgsql
    security definer set search_path = ''
as $$
begin
    insert into public.profiles (id, username, role)
    values (new.id,
            coalesce(new.raw_user_meta_data ->> 'username', 'user'),
            'student');
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ======================================================================== RLS

alter table profiles          enable row level security;
alter table lessons           enable row level security;
alter table tracks            enable row level security;
alter table track_keys        enable row level security;  -- no policies: deny all
alter table entitlements      enable row level security;
alter table playback_sessions enable row level security;  -- no policies: deny all
alter table playback_progress enable row level security;
alter table ingest_jobs       enable row level security;

create policy "Users can view their own profile"
    on profiles for select to authenticated
    using (id = auth.uid() or public.is_admin(auth.uid()));
create policy "Users can update their own profile"
    on profiles for update to authenticated
    using (id = auth.uid());

-- The whole catalogue is visible, including locked lessons: seeing what she is
-- missing is what makes a student contact Idit.
create policy "Anyone signed in can view lessons"
    on lessons for select to authenticated using (true);
create policy "Admins manage lessons"
    on lessons for all to authenticated
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

-- Metadata only. No key material lives here.
create policy "Anyone signed in can view tracks"
    on tracks for select to authenticated using (true);
create policy "Admins manage tracks"
    on tracks for all to authenticated
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

create policy "Users can view their own entitlements"
    on entitlements for select to authenticated
    using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "Admins manage entitlements"
    on entitlements for all to authenticated
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

create policy "Users own their playback progress"
    on playback_progress for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "Admins can view ingest jobs"
    on ingest_jobs for select to authenticated
    using (public.is_admin(auth.uid()));

-- ===================================================================== GRANTS
-- The project is created with "Automatically expose new tables" OFF, so the
-- Data API sees nothing until it is granted explicitly. That is deliberate:
-- `track_keys` and `playback_sessions` are never granted, so they are absent
-- from the API entirely and a future RLS mistake cannot leak key material.
-- Everything granted below is still gated by the RLS policies above.

grant usage on schema public to anon, authenticated;

grant select                         on public.lessons           to authenticated;
grant select                         on public.tracks            to authenticated;
grant select, update                 on public.profiles          to authenticated;
grant select                         on public.entitlements      to authenticated;
grant select, insert, update, delete on public.playback_progress to authenticated;
grant select                         on public.ingest_jobs       to authenticated;

-- Admin writes go through the same API, guarded by the is_admin() policies.
grant insert, update, delete on public.lessons      to authenticated;
grant insert, update, delete on public.tracks       to authenticated;
grant insert, update, delete on public.entitlements to authenticated;

grant execute on function public.has_active_access(uuid) to authenticated;
grant execute on function public.is_admin(uuid)          to authenticated;

-- NOT granted, intentionally: track_keys, playback_sessions.
-- Only the Edge Functions reach these, using the service_role key.
