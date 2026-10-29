-- Summaries become catalogue items of their own, lesson numbers are assigned
-- automatically, and admins can promote or demote other users.

-- ============================================================ security fix
-- "Users can update their own profile" had no column restriction, so any
-- student could set her own role to 'admin' through the Data API. Nothing in
-- the app writes to profiles, so the update grant goes entirely; role changes
-- go through set_user_role() below.
revoke update on public.profiles from authenticated;

-- ============================================================== categories
-- A summary is not tied 1:1 to a lesson, so it is a lesson row of its own
-- category with a single 'full' track, rather than a second track.
create type lesson_category as enum ('lesson', 'summary');
alter table lessons add column category lesson_category not null default 'lesson';
create index on lessons (category, lesson_number);

-- ======================================================= automatic numbers
-- Numbers follow the order items are added, counted per category.
create or replace function public.assign_lesson_number()
    returns trigger language plpgsql
    set search_path = ''
as $$
begin
    if new.lesson_number is null then
        select coalesce(max(lesson_number), 0) + 1
          into new.lesson_number
          from public.lessons
         where category = new.category;
    end if;
    return new;
end;
$$;

create trigger lessons_assign_number
    before insert on lessons
    for each row execute function public.assign_lesson_number();

-- Existing summary tracks move to their own summary items. The encrypted
-- segments stay where they are: tracks.hls_prefix keeps pointing at them.
do $$
declare
    r      record;
    new_id uuid;
begin
    for r in
        select t.id as track_id, t.status as track_status, l.*
          from public.tracks t
          join public.lessons l on l.id = t.lesson_id
         where t.kind = 'summary'
    loop
        insert into public.lessons (title, lesson_date, is_free, status, category)
        values ('סיכום — ' || r.title, r.lesson_date, r.is_free,
                case when r.track_status = 'ready' then 'ready' else 'draft' end::public.lesson_status,
                'summary')
        returning id into new_id;

        update public.tracks set lesson_id = new_id, kind = 'full' where id = r.track_id;
        update public.ingest_jobs set lesson_id = new_id, kind = 'full'
         where lesson_id = r.id and kind = 'summary';
    end loop;
end;
$$;

-- ================================================================== roles
create or replace function public.set_user_role(target uuid, new_role public.user_role)
    returns void language plpgsql
    security definer set search_path = ''
as $$
begin
    if not public.is_admin(auth.uid()) then
        raise exception 'only admins can change roles' using errcode = '42501';
    end if;
    -- Removing your own admin role could leave the app with no admin at all.
    if target = auth.uid() and new_role <> 'admin' then
        raise exception 'admins cannot remove their own admin role' using errcode = '42501';
    end if;
    update public.profiles set role = new_role where id = target;
end;
$$;

revoke all on function public.set_user_role(uuid, public.user_role) from public, anon;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;
