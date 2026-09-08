-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 5 — הרשאות לפי תפקיד, ציוד אישי, השלמות וסוג אימון
--
--  להריץ אחרי patch-04. בטוח להריץ שוב ושוב.
--
--  אם תריץ שוב עדכון מוקדם יותר (01 או 02) — הרץ אחריו גם את זה. הם בונים
--  מחדש את אותן תצוגות, והאחרון שרץ הוא זה שקובע.
--
--  מה נכנס כאן:
--
--  · **רס״פ** — הציוד. מאגר הרכבים, הקטלוגים, והלוגיסטיקה של כל אימון: ציוד,
--    רכבים, תחמושת ומזון. לא מהלך היום ולא פרטי לוחמים.
--
--  · **סמל צוות** — הציוד האישי. נשק, אמר״ל והכשרות בכרטיס של כל אחד, ושום
--    דבר אחר בו. הוא גם רואה את הצ׳ים, כי הוא זה שרושם אותם.
--
--  · **מפקד צוות** — הכרטיסים של הצוות שלו במלואם, וגם של עצמו. מה שאינו
--    יכול הוא למנות: מפקד צוות, מדריך, מפקד חפ״ק או מנהל מערכת.
--
--  · **נהג חייב רישיון בתוקף** — נהיגה מבצעית או נהג רכב צבאי, נכון ליום
--    האימון. זו ההסמכה היחידה שחוסמת ולא רק מתריעה.
--
--  · **אמר״ל אישי** — סוג וצ׳, לצד הנשק, לדו״ח צל״ם.
--
--  · **השלמות ושיבוץ בין צוותים** — לוחם שהחמיץ אימון משובץ להשלמה באימון של
--    צוות אחר, ואז האימון שהחמיץ מפסיק להיספר לו כאפס. החלטה של מפקד צוות
--    ומעלה; לוחם לא מסדר לעצמו השלמה.
--
--  · **סוג אימון** — רטוב, חלקי או יבש. הבחירה קובעת מה נמשך ומה נצרך.
--
--  · **תשובת נוכחות ניתנת פעם אחת** — הלוחם עונה לעצמו, ומשם זו השורה של
--    המפקד.
--
--  הכול נאכף כאן ולא רק במסכים, כדי שכפתור מוסתר לא יהיה הדבר היחיד שעומד בין
--  מישהו לבין מה שאסור לו.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── מי הוא מי ──────────────────────────────────────────────────────────────

create or replace function is_rasap() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'רס״פ' and status = 'active' from people where auth_id = auth.uid()), false)
$$;

create or replace function is_sergeant() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'סמל צוות' and status = 'active' from people where auth_id = auth.uid()), false)
$$;

grant execute on function is_rasap(), is_sergeant() to authenticated;


-- ── הרס״פ: ציוד ורכבים ─────────────────────────────────────────────────────

drop policy if exists fleet_write on fleet;
create policy fleet_write on fleet for all to authenticated
  using (is_admin() or is_team_cmd() or is_rasap())
  with check (is_admin() or is_team_cmd() or is_rasap());

do $$
declare tbl text;
begin
  foreach tbl in array array['gear_catalog', 'vehicle_types', 'weapons', 'locations'] loop
    execute format('drop policy if exists %I_write on %I', tbl, tbl);
    execute format(
      'create policy %I_write on %I for all to authenticated '
      'using (is_admin() or is_team_cmd() or is_rasap()) '
      'with check (is_admin() or is_team_cmd() or is_rasap())',
      tbl, tbl);
  end loop;

  -- הלוגיסטיקה של אימון, אבל לא מהלך היום: התוכנית של המפקד, הציוד של הרס״פ
  foreach tbl in array array['gear_items', 'vehicles', 'ammo', 'food'] loop
    execute format('drop policy if exists %I_write on %I', tbl, tbl);
    execute format(
      'create policy %I_write on %I for all to authenticated '
      'using (can_edit_training(training_id) or is_rasap()) '
      'with check (can_edit_training(training_id) or is_rasap())',
      tbl, tbl);
  end loop;
end $$;


-- ── ציוד אישי: אמר״ל לצד הנשק ──────────────────────────────────────────────

alter table people add column if not exists nvg        text not null default '';
alter table people add column if not exists nvg_serial text not null default '';

comment on column people.nvg is 'סוג אמר״ל אישי';
comment on column people.nvg_serial is 'צ׳ של האמר״ל';

grant select (nvg, nvg_serial) on people to authenticated;


-- ── מי רשאי לערוך כרטיס של מי ──────────────────────────────────────────────

drop policy if exists people_update on people;
create policy people_update on people for update to authenticated
  using (
    is_admin() or id = me_id() or is_sergeant()
    or (is_team_cmd() and team_id is not distinct from my_team())
  )
  with check (
    is_admin() or id = me_id() or is_sergeant()
    or (is_team_cmd() and team_id is not distinct from my_team())
  );

-- המדיניות קובעת אילו שורות; זה קובע אילו עמודות. שניהם נדרשים.
create or replace function guard_people_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  own      text[] := array['notif', 'updated_at'];
  kit      text[] := array['weapon', 'weapon_serial', 'nvg', 'nvg_serial', 'certs', 'updated_at'];
  -- ארבעת המינויים, ועוד מה שאיש אינו עורך ביד
  no_touch text[] := array[
    'is_team_commander', 'is_instructor', 'is_hapak_commander', 'is_admin',
    'qual', 'auth_id', 'pin_hash', 'pin_set_at', 'sessions_valid_from'
  ];
  col text;
begin
  -- בלי JWT: השרת פועל בשם עצמו (מסלולי הכניסה כותבים pin_hash ו-auth_id
  -- עם מפתח השירות, שאין בו טוקן)
  if auth.uid() is null then return new; end if;
  if is_admin() then return new; end if;

  if new.id = me_id() and not is_team_cmd() then
    if is_sergeant() then own := own || kit; end if;
    if (to_jsonb(new) - own) is distinct from (to_jsonb(old) - own) then
      raise exception 'רק מנהל מערכת או מפקד החפ״ק יכולים לשנות פרטים, הרשאות והסמכות';
    end if;
    return new;
  end if;

  -- הכרטיס של מפקד הצוות הוא אחד מכרטיסי הצוות שלו
  if is_team_cmd()
     and (new.id = me_id() or old.team_id is not distinct from my_team()) then
    foreach col in array no_touch loop
      if to_jsonb(new)->col is distinct from to_jsonb(old)->col then
        raise exception 'מפקד צוות אינו ממנה מפקד צוות, מדריך, מפקד חפ״ק או מנהל מערכת';
      end if;
    end loop;
    return new;
  end if;

  if is_sergeant() then
    if (to_jsonb(new) - kit) is distinct from (to_jsonb(old) - kit) then
      raise exception 'סמל צוות רשאי לעדכן נשק, אמר״ל והכשרות בלבד';
    end if;
    return new;
  end if;

  raise exception 'אין הרשאה לערוך לוחם אחר';
end $$;

-- צ׳ הוא מספר פריט מבוקר: מוסתר מכולם חוץ מבעליו, מהמפקדים ומסמל הצוות —
-- שהוא זה שרושם אותו. זה לא פותח לו את המספרים האישיים.
create or replace view people_view as
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
  p.nvg,
  case
    when can_see_pn() or p.id = me_id() or is_sergeant() then p.nvg_serial
    else ''
  end as nvg_serial
from people p
where me_id() is not null or auth.uid() is null;

grant select on people_view to authenticated;


-- ── נהג חייב רישיון בתוקף ──────────────────────────────────────────────────
--
-- נבדק מול יום האימון ולא מול היום שבו נערכה השורה: רישיון שפג בשבוע שלפני
-- אינו רישיון בבוקר שהשיירה יוצאת.

create or replace function guard_vehicle_driver() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  day date;
  licensed boolean;
begin
  if new.driver_id is null then return new; end if;
  select t.date into day from trainings t where t.id = new.training_id;
  if day is null then return new; end if;

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


-- ── השלמות ושיבוץ לאימון של צוות אחר ───────────────────────────────────────

create table if not exists training_guests (
  training_id uuid not null references trainings (id) on delete cascade,
  person_id   uuid not null references people (id) on delete cascade,
  -- האימון שההשלמה באה במקומו; ריק כשזה פשוט תגבור ליום
  makeup_for  uuid references trainings (id) on delete set null,
  added_by    uuid references people (id) on delete set null,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  primary key (training_id, person_id)
);

create index if not exists training_guests_person_idx on training_guests (person_id);
create index if not exists training_guests_makeup_idx on training_guests (makeup_for);

comment on table training_guests is
  'לוחם שמשובץ לאימון של צוות אחר — בהשלמה על אימון שהחמיץ, או כתגבור';

alter table training_guests enable row level security;

drop policy if exists guests_read on training_guests;
create policy guests_read on training_guests for select to authenticated
  using (me_id() is not null);

drop policy if exists guests_write on training_guests;
create policy guests_write on training_guests for all to authenticated
  using (is_admin() or is_team_cmd())
  with check (is_admin() or is_team_cmd());

revoke all on training_guests from authenticated, anon;
grant select, insert, update, delete on training_guests to authenticated;

-- אורח נספר ככוח: לרשימה, למזון, למקומות ברכב, ולמדיניות
create or replace function training_participants(tid uuid)
returns setof people
language sql stable security definer set search_path = public as $$
  select p.* from people p, trainings t
  where t.id = tid and p.status = 'active' and p.team_id is not null
    and (t.team_id = 'joint'
         or p.team_id::text = t.team_id::text
         or exists (select 1 from teams tm where tm.id = p.team_id and tm.attends_all))
  union
  select p.* from people p
   join training_guests g on g.person_id = p.id
  where g.training_id = tid and p.status = 'active'
$$;

create or replace function is_participant(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trainings t
    where t.id = tid
      and (t.team_id = 'joint' or t.team_id::text = my_team()::text
           or t.instructor_id = me_id() or t.commander_id = me_id()
           or exists (select 1 from teams tm where tm.id = my_team() and tm.attends_all))
  ) or exists (
    select 1 from training_guests g where g.training_id = tid and g.person_id = me_id()
  )
$$;


-- ── יבש, רטוב או חלקי ──────────────────────────────────────────────────────

alter table trainings add column if not exists fire_mode text not null default 'wet';

alter table trainings drop constraint if exists trainings_fire_mode_check;
alter table trainings add constraint trainings_fire_mode_check
  check (fire_mode in ('wet', 'partial', 'dry'));

comment on column trainings.fire_mode is 'רטוב / חלקי / יבש — כמה מהיום הוא ירי חי';

-- המסך קורא מהתצוגה, ותצוגה קיימת אינה מקבלת עמודה חדשה מעצמה
drop view if exists trainings_view;
create view trainings_view as
select t.*, coalesce(s.seq, 0) as seq
from trainings t left join trainings_seq s on s.id = t.id
where me_id() is not null or auth.uid() is null;

grant select on trainings_view to authenticated;


-- ── תשובת נוכחות ניתנת פעם אחת ─────────────────────────────────────────────
--
-- הלוחם עונה לעצמו פעם אחת. אחרי זה השורה של המפקד: מספר שאפשר לתקן בשקט
-- בערב שלפני אינו מספר שאפשר לתכנן לפיו. את התשובה הראשונה הוא עדיין יוצר,
-- והמפקד עדיין מסמן אותו מתי שצריך.

drop policy if exists attendance_update on attendance;
create policy attendance_update on attendance for update to authenticated
  using (can_approve_training(training_id) or is_training_cmd(training_id))
  with check (can_approve_training(training_id) or is_training_cmd(training_id));
