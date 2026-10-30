-- Listening statistics for the admin screen.
--
-- playback_progress (one row per student per track, updated every ~10s while
-- playing) and playback_sessions (one row per play) are not readable by
-- admins through RLS, and should not be: these functions expose only
-- aggregates and per-student progress, and only to admins. Admins' own
-- listening is left out so testing does not skew the numbers.

create index if not exists playback_progress_track_idx on playback_progress (track_id);
create index if not exists playback_sessions_track_idx on playback_sessions (track_id, user_id);

-- One row per catalogue item.
create or replace function public.admin_lesson_stats()
    returns table (
        lesson_id        uuid,
        category         public.lesson_category,
        lesson_number    int,
        title            text,
        status           public.lesson_status,
        duration_seconds int,
        listeners        int,       -- students who started it
        finished         int,       -- reached 90% or more
        avg_percent      int,       -- average of how far each listener got
        plays            int,       -- times playback was started
        last_listened_at timestamptz
    )
    language plpgsql stable
    security definer set search_path = ''
as $$
begin
    if not public.is_admin(auth.uid()) then
        raise exception 'only admins can read statistics' using errcode = '42501';
    end if;
    return query
    with students as (
        select id from public.profiles where role = 'student'
    ),
    progress as (
        select t.lesson_id, p.user_id, p.updated_at,
               least(1.0, p.position_seconds::numeric / nullif(t.duration_seconds, 0)) as frac
          from public.playback_progress p
          join public.tracks t on t.id = p.track_id
         where p.user_id in (select id from students) and p.position_seconds > 0
    ),
    plays as (
        select t.lesson_id, count(*)::int as n
          from public.playback_sessions s
          join public.tracks t on t.id = s.track_id
         where s.user_id in (select id from students)
         group by t.lesson_id
    )
    select l.id, l.category, l.lesson_number, l.title, l.status,
           (select max(t.duration_seconds) from public.tracks t where t.lesson_id = l.id),
           count(pr.user_id)::int,
           count(pr.user_id) filter (where pr.frac >= 0.9)::int,
           coalesce(round(avg(pr.frac) * 100), 0)::int,
           coalesce(max(pl.n), 0)::int,
           max(pr.updated_at)
      from public.lessons l
      left join progress pr on pr.lesson_id = l.id
      left join plays pl on pl.lesson_id = l.id
     group by l.id
     order by l.category, l.lesson_number desc nulls last;
end;
$$;

-- Who listened to one item, and how far she got.
create or replace function public.admin_lesson_listeners(target_lesson uuid)
    returns table (username text, percent int, updated_at timestamptz)
    language plpgsql stable
    security definer set search_path = ''
as $$
begin
    if not public.is_admin(auth.uid()) then
        raise exception 'only admins can read statistics' using errcode = '42501';
    end if;
    return query
    select pf.username,
           least(100, round(p.position_seconds * 100.0 / nullif(t.duration_seconds, 0)))::int,
           p.updated_at
      from public.playback_progress p
      join public.tracks t on t.id = p.track_id
      join public.profiles pf on pf.id = p.user_id
     where t.lesson_id = target_lesson and pf.role = 'student' and p.position_seconds > 0
     order by p.updated_at desc;
end;
$$;

-- One row per student: how much she has listened to and when she last did.
create or replace function public.admin_student_activity()
    returns table (
        username         text,
        has_access       boolean,
        lessons_started  int,
        lessons_finished int,
        last_listened_at timestamptz
    )
    language plpgsql stable
    security definer set search_path = ''
as $$
begin
    if not public.is_admin(auth.uid()) then
        raise exception 'only admins can read statistics' using errcode = '42501';
    end if;
    return query
    select pf.username,
           public.has_active_access(pf.id),
           count(p.track_id) filter (where p.position_seconds > 0)::int,
           count(p.track_id) filter (
               where p.position_seconds >= 0.9 * nullif(t.duration_seconds, 0))::int,
           max(p.updated_at)
      from public.profiles pf
      left join public.playback_progress p on p.user_id = pf.id
      left join public.tracks t on t.id = p.track_id
     where pf.role = 'student'
     group by pf.id
     order by max(p.updated_at) desc nulls last, pf.username;
end;
$$;

revoke all on function public.admin_lesson_stats() from public, anon;
revoke all on function public.admin_lesson_listeners(uuid) from public, anon;
revoke all on function public.admin_student_activity() from public, anon;
grant execute on function public.admin_lesson_stats() to authenticated;
grant execute on function public.admin_lesson_listeners(uuid) to authenticated;
grant execute on function public.admin_student_activity() to authenticated;
