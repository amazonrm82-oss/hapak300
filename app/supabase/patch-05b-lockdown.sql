-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 5ב — נהג מוסמך, מה חובה בכל אימון, וסגירת הגישה למי שלא נכנס
--
--  זה ההמשך של patch-05, לא במקומו. מי שכבר הריץ את 05 מריץ רק את הקובץ הזה;
--  מי שמריץ עכשיו את 05 המעודכן מקבל את הכול בתוכו וגם אז מותר להריץ את זה
--  שוב — הכול כאן בטוח להרצה חוזרת.
--
--  מה נכנס כאן:
--
--  · **נהג הוא סימון בפני עצמו** — לוחם נוהג בנוסף לתפקידו, ורק מי שמסומן כך
--    ורישיונו בתוקף ליום האימון יכול להיות משובץ לרכב.
--
--  · **מה חובה בכל אימון** — מאבטח אינו חובה, ונהג נדרש רק כשמצוין רכב.
--
--  · **מי שלא נכנס למערכת אינו רואה דבר** — זה החלק החשוב כאן. עד עכשיו
--    המפתח הציבורי שמוטמע באפליקציה פתח את התצוגות: שמות, דרגות, טלפונים
--    ולו״ז מלא, בלי שום התחברות. מהרגע שהקובץ הזה רץ — כלום, חוץ מבקשת
--    הצטרפות.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── הסימון בכרטיס: נהג, בנוסף לתפקיד ──────────────────────────────────────

alter table people add column if not exists is_driver boolean not null default false;

comment on column people.is_driver is 'ניתן לשבץ כנהג רכב — בנוסף לתפקידו';

-- whoever was carried as a driver by his role keeps being one
update people set is_driver = true where role = 'נהג' and not is_driver;

grant select (is_driver) on people to authenticated;


-- ── תצוגת הכרטיסים, מחדש ──────────────────────────────────────────────────
--
-- צ׳ הוא מספר פריט מבוקר: מוסתר מכולם חוץ מבעליו, מהמפקדים ומסמל הצוות —
-- שהוא זה שרושם אותו. זה לא פותח לו את המספרים האישיים.
--
-- `create or replace view` יודע רק להוסיף עמודה בסוף — לא לשנות סדר.
-- כאן is_driver נכנס לפני עמודות האמר״ל, ולכן התצוגה נמחקת ונבנית מחדש.
drop view if exists people_view;
create view people_view as
select
  p.id,
  p.team_id,
  p.rank,
  p.name,
  p.role,
  case when can_see_pn() or p.id = me_id() then p.pn else '' end as pn,
  p.phone,
  p.status,
  p.status_note,
  p.rating,
  p.qual,
  p.is_team_commander,
  p.is_instructor,
  p.is_admin,
  p.is_hapak_commander,
  p.certs,
  p.notif,
  (p.pin_hash is not null) as has_pin,
  p.pin_set_at,
  p.created_at,
  p.updated_at,
  p.weapon,
  case
    when can_see_pn() or p.id = me_id() or is_sergeant() then p.weapon_serial
    else ''
  end as weapon_serial,
  p.medical_profile,
  p.limitations,
  p.is_driver,
  p.nvg,
  case
    when can_see_pn() or p.id = me_id() or is_sergeant() then p.nvg_serial
    else ''
  end as nvg_serial
from people p
where me_id() is not null or auth.uid() is null;

grant select on people_view to authenticated;


-- ── ורק נהג מוסמך נכנס לרכב ───────────────────────────────────────────────
--
-- A fighter drives on top of whatever else he does — a medic who drives is
-- still the medic — so being offered as a driver is its own mark rather than a
-- side effect of the `role` field, and it takes a licence in date on the day.
--
-- הרישיון נבדק מול יום האימון ולא מול היום שבו נערכה השורה: רישיון שפג בשבוע
-- שלפני אינו רישיון בבוקר שהשיירה יוצאת.

create or replace function guard_vehicle_driver() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  day date;
  marked boolean;
  licensed boolean;
begin
  if new.driver_id is null then return new; end if;
  select t.date into day from trainings t where t.id = new.training_id;
  if day is null then return new; end if;

  select p.is_driver or p.role = 'נהג' into marked from people p where p.id = new.driver_id;
  if not coalesce(marked, false) then
    raise exception 'רק מי שמוגדר נהג יכול להיות משובץ כנהג רכב';
  end if;

  select coalesce(bool_or(
           p.certs ? k
           and (p.certs->>k) ~ '^\d{4}-\d{2}-\d{2}$'
           and (p.certs->>k)::date >= day), false)
    into licensed
    from people p
    cross join unnest(array['drive', 'mildrive']) as k
   where p.id = new.driver_id;

  if not licensed then
    raise exception 'נהג חייב נהיגה מבצעית או נהג רכב צבאי בתוקף ליום האימון';
  end if;
  return new;
end $$;

drop trigger if exists vehicles_driver_guard on vehicles;
create trigger vehicles_driver_guard before insert or update on vehicles
  for each row execute function guard_vehicle_driver();


-- ── מאבטח אינו חובה, ונהג נדרש רק כשיש רכב ─────────────────────────────────
--
-- אזהרה שקופצת בכל אימון היא אזהרה שאיש כבר לא קורא. מאבטח אינו נדרש בכל
-- אימון, ונהג נדרש רק באימון שמצוין בו רכב — ואז נספרים רק נהגים מוסמכים
-- מול מספר הרכבים. שתי הבדיקות האלה יושבות ברשימת הרכבים, לא כאן.

alter table settings alter column essential_roles set default array['חובש'];

-- מאבטח יורד רק אם איש לא נגע ברשימה מאז ההתקנה — בחירה של מנהל נשארת שלו
update settings
   set essential_roles = array['חובש']
 where essential_roles @> array['חובש', 'נהג', 'מאבטח']
   and coalesce(array_length(essential_roles, 1), 0) = 3;

-- נהג יורד בכל מקרה: הוא נבדק מול רשימת הרכבים ולא מול הרשימה הזאת
update settings
   set essential_roles = array(select unnest(essential_roles) except select 'נהג')
 where 'נהג' = any (essential_roles);


-- ── מה שמותר למי שלא נכנס ──────────────────────────────────────────────────
--
-- Supabase grants `anon` — the role behind the public key that ships inside the
-- browser bundle — full privileges on everything in `public` by default. On the
-- tables that is harmless: every policy here is written `to authenticated`, so
-- an anonymous caller matches no policy and reads nothing.
--
-- The views are the exception, and it is the whole difference. A view runs with
-- its owner's rights and does not consult the underlying table's row-level
-- security — that is exactly why this system uses them. So `people_view` and
-- `trainings_view` answered anyone holding the public key: every name, rank,
-- role, team and phone number in the unit, and the whole training schedule.
--
-- The rule from here: someone who has not signed in gets nothing at all, except
-- the one thing an outsider is meant to be able to do — ask to join.

do $$
declare obj text;
begin
  for obj in
    select table_name from information_schema.tables
     where table_schema = 'public' and table_type in ('BASE TABLE', 'VIEW')
  loop
    execute format('revoke all on public.%I from anon', obj);
    execute format('revoke all on public.%I from public', obj);
  end loop;
end $$;

-- and anything added later starts closed too
alter default privileges in schema public revoke all on tables from anon;

-- the one door left open: the join form, which by definition is used by someone
-- who has no account yet. Insert only — he cannot read back what he sent, nor
-- anything else.
grant insert on join_requests to anon;
