-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון המערכת — הדבקה 2 מתוך 2
--
--  עדכונים 3ב׳–12. להריץ אחרי update-1.sql.
--
--  אין צורך לדעת מה כבר הורץ. כל מה שכאן בטוח להריץ שוב: מה שכבר קיים נשאר
--  כמו שהוא, ומה שחסר נוסף. שום נתון קיים — לוחמים, אימונים, נוכחות — לא
--  נמחק ולא משתנה.
--
--  איך: בדשבורד של Supabase → SQL Editor → New query → הדבק הכול → Run.
--  כשזה עבר — הרץ את verify.sql כדי לראות טבלה של ✅ על הכול.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- patch-03b-sadir.sql
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 3, חלק ב׳ — צוות "סדיר"
--
--  להריץ **אחרי** patch-03a. בטוח להריץ שוב ושוב.
--
--  סדיר אינו מתאמן לבד: הוא מצטרף לכל אימון של צוות א׳ או צוות ב׳. לכן חבריו
--  מקבלים זימון, מסמנים נוכחות, נספרים במזון, במקומות ברכב ובתחמושת — בכל
--  אימון — אבל אי אפשר ליצור אימון שהוא "של סדיר" בלבד.
--
--  זה נשען על דגל `attends_all` בטבלת הצוותים, כך שאפשר יהיה להגדיר בעתיד עוד
--  צוות שמתנהג כך בלי לגעת בקוד.
-- ═══════════════════════════════════════════════════════════════════════════

alter table teams add column if not exists attends_all boolean not null default false;

insert into teams (id, name, attends_all) values ('c', 'סדיר', true)
on conflict (id) do update set attends_all = true;

create or replace function training_participants(tid uuid)
returns setof people
language sql stable security definer set search_path = public as $$
  select p.* from people p, trainings t
  where t.id = tid and p.status = 'active' and p.team_id is not null
    and (t.team_id = 'joint'
         or p.team_id::text = t.team_id::text
         or exists (select 1 from teams tm where tm.id = p.team_id and tm.attends_all))
$$;

create or replace function is_participant(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trainings t
    where t.id = tid
      and (t.team_id = 'joint' or t.team_id::text = my_team()::text
           or t.instructor_id = me_id() or t.commander_id = me_id()
           or exists (select 1 from teams tm where tm.id = my_team() and tm.attends_all))
  )
$$;

-- לבדיקה:
--   select id, name, attends_all from teams;
--   select count(*) from training_participants((select id from trainings limit 1));


-- ───────────────────────────────────────────────────────────────────────────
-- patch-04-drills.sql
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 4 — מקצים וציונים
--
--  להריץ אחרי patch-03b. בטוח להריץ שוב ושוב.
--
--  מה נכנס כאן:
--
--  · לכל אימון אפשר להוסיף **מקצים** — ירי בעמידה, ירי בתנועה, החלפת מחסנית.
--    לכל מקצה: שם, תיאור מה היה בו, וסוג מדידה.
--
--  · לכל לוחם בכל מקצה נרשם כמה ירה וכמה פגע, והציון (0–100) מחושב בבסיס
--    הנתונים — כדי ששני מסכים לא יוכלו לחלוק על מה ש-12 מתוך 20 שווה.
--
--  · ציון הלוחם באימון הוא ממוצע משוקלל של המקצים שהשתתף בהם; ציון האימון הוא
--    ממוצע הלוחמים. מקצה שלוחם לא השתתף בו אינו נספר לו כאפס.
--
--  · בנוסף לציון המדוד — ציון המפקד: 1–10 לכל לוחם (נשמר בנוכחות), ו-0–100
--    לאימון כולו.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- מקצים — the stations a training is actually made of.
--
-- A shooting day is not one thing: it is ירי בעמידה, ירי בתנועה, החלפת מחסנית.
-- Each is run, each is measured per fighter, and the training's result is what
-- those add up to. Until now a training had attendance and a commander's
-- impression, and nothing in between.
-- ═══════════════════════════════════════════════════════════════════════════

-- How a drill is scored. 'hits' counts rounds fired against rounds on target —
-- the score writes itself. 'score' is a number the instructor judges directly,
-- for a station that has no hit count. 'passfail' is the same thing with two
-- values, kept separate so a screen can show it as a checkbox.
do $k$
begin
  create type drill_kind as enum ('hits', 'score', 'passfail');
exception when duplicate_object then null;
end $k$;

create table if not exists drills (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  name        text not null,
  description text not null default '',
  kind        drill_kind not null default 'hits',
  -- what a fighter is expected to fire, so the form can prefill and the
  -- ammunition plan has something to be checked against
  rounds      int not null default 0 check (rounds >= 0),
  -- a station that matters more than another: 2 counts double in the average
  weight      numeric(4, 2) not null default 1 check (weight > 0 and weight <= 10),
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists drills_training_idx on drills (training_id);
drop trigger if exists drills_updated on drills;
create trigger drills_updated before update on drills
  for each row execute function set_updated_at();

create table if not exists drill_results (
  id         uuid primary key default gen_random_uuid(),
  drill_id   uuid not null references drills (id) on delete cascade,
  person_id  uuid not null references people (id) on delete cascade,
  shots      int check (shots is null or shots >= 0),
  hits       int check (hits is null or hits >= 0),
  -- 0–100. Written by the trigger below for a 'hits' drill, entered directly
  -- otherwise; kept as a column so the archive does not depend on the formula.
  score      numeric(5, 2) check (score is null or (score >= 0 and score <= 100)),
  note       text not null default '',
  by_id      uuid references people (id) on delete set null,
  at         timestamptz not null default now(),
  unique (drill_id, person_id)
);
create index if not exists drill_results_drill_idx on drill_results (drill_id);
create index if not exists drill_results_person_idx on drill_results (person_id);

-- A hit count and a score are the same fact stated twice; the database decides
-- which one wins so two screens can never disagree about it.
create or replace function set_drill_score() returns trigger
language plpgsql set search_path = public as $$
declare k drill_kind;
begin
  select kind into k from drills where id = new.drill_id;

  if k = 'hits' then
    if new.hits is not null and new.shots is not null and new.shots > 0 then
      if new.hits > new.shots then
        raise exception 'לא ייתכן שמספר הפגיעות גדול ממספר הכדורים שנורו';
      end if;
      new.score := round((100.0 * new.hits) / new.shots, 2);
    else
      new.score := null;
    end if;
  elsif k = 'passfail' then
    new.score := case when new.score is null then null
                      when new.score >= 50 then 100 else 0 end;
  end if;

  return new;
end $$;

drop trigger if exists drill_results_score on drill_results;
create trigger drill_results_score before insert or update on drill_results
  for each row execute function set_drill_score();

-- ── who may see and record ─────────────────────────────────────────────────
alter table drills        enable row level security;
alter table drill_results enable row level security;

-- the drills themselves are part of the training plan: everyone taking part
-- sees them, the people who run the training write them
drop policy if exists drills_read on drills;
create policy drills_read on drills for select to authenticated
  using (is_participant(training_id) or is_admin());
drop policy if exists drills_write on drills;
create policy drills_write on drills for all to authenticated
  using (can_edit_training(training_id))
  with check (can_edit_training(training_id));

-- a fighter sees their own result and nobody else's, exactly as with
-- attendance; whoever runs the training sees and records the lot
drop policy if exists drill_results_read on drill_results;
create policy drill_results_read on drill_results for select to authenticated
  using (
    person_id = me_id()
    or sees_list((select training_id from drills where id = drill_id))
  );
drop policy if exists drill_results_write on drill_results;
create policy drill_results_write on drill_results for all to authenticated
  using (can_edit_training((select training_id from drills where id = drill_id)))
  with check (can_edit_training((select training_id from drills where id = drill_id)));

do $$ begin alter publication supabase_realtime add table drills;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table drill_results;
exception when duplicate_object then null; end $$;

grant select, insert, update, delete on drills, drill_results to authenticated;

-- ── the commander's grade for the training itself ──────────────────────────
alter table trainings add column if not exists grade      int
  check (grade is null or grade between 0 and 100);
alter table trainings add column if not exists grade_note text not null default '';

comment on column trainings.grade is
  'ציון המפקד לאימון כולו, 0–100. ציון המקצים מחושב בנפרד מהתוצאות.';


-- ── the training view has to be rebuilt around the new columns ─────────────
--
-- A view stores the column list it was created with: `t.*` was expanded once,
-- so `trainings_view` does not gain `grade` on its own — the client would never
-- see it. And `create or replace` cannot insert a column before `seq`, so the
-- view is dropped and rebuilt rather than replaced.
drop view if exists trainings_view;
create view trainings_view as
select t.*, coalesce(s.seq, 0) as seq
from trainings t
left join trainings_seq s on s.id = t.id
where me_id() is not null or auth.uid() is null;

grant select on trainings_view to authenticated;

-- Recording a grade is the training commander's, the team commander's or an
-- administrator's — the same people who approve the attendance.
create or replace function set_training_grade(tid uuid, value int, note text default '')
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or is_training_cmd(tid) or can_approve_training(tid)) then
    raise exception 'מתן ציון לאימון שמור למפקד האימון ולמפקד הצוות';
  end if;
  if value is not null and (value < 0 or value > 100) then
    raise exception 'ציון האימון חייב להיות בין 0 ל-100';
  end if;
  update trainings set grade = value, grade_note = coalesce(note, '') where id = tid;
end $$;

grant execute on function set_training_grade(uuid, int, text) to authenticated;

-- לבדיקה:
--   select name, kind from drills;
--   select count(*) from drill_results;


-- ───────────────────────────────────────────────────────────────────────────
-- patch-05-roles.sql
-- ───────────────────────────────────────────────────────────────────────────

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

alter table people add column if not exists is_driver boolean not null default false;

comment on column people.is_driver is 'ניתן לשבץ כנהג רכב — בנוסף לתפקידו';

-- whoever was carried as a driver by his role keeps being one
update people set is_driver = true where role = 'נהג' and not is_driver;

grant select (is_driver) on people to authenticated;


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


-- ── נהג: סימון בפני עצמו, ורישיון בתוקף ────────────────────────────────────
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


-- ───────────────────────────────────────────────────────────────────────────
-- patch-05b-lockdown.sql
-- ───────────────────────────────────────────────────────────────────────────

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


-- ───────────────────────────────────────────────────────────────────────────
-- patch-06-absence.sql
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 6 — היעדרות עם תאריכים, ותיקון סוג האימון ביצירה
--
--  להריץ אחרי 5ב. בטוח להרצה חוזרת.
--
--  · **היעדרות** — לכל לוחם אפשר לרשום מתי הוא לא כאן. בטווח הזה הוא אינו
--    נספר על אימון, אינו מקבל תזכורת, ואינו מקבל אפס על אימון שהחמיץ.
--
--  · **סוג אימון ביצירה** — רטוב / חלקי / יבש נשמר עד היום רק בעריכה. אימון
--    חדש נולד ״רטוב״ בלי קשר למה שנבחר. מתוקן.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── היעדרות עם תאריכים ─────────────────────────────────────────────────────
--
-- קורס, אשפוז, חו״ל. עד היום היה רק ״פעיל / מושבת״, ומי שנעדר לשלושה שבועות
-- קיבל תזכורות, נספר כמי שלא ענה, וקיבל אפס על אימון שלא היה יכול להגיע
-- אליו. בטווח התאריכים הזה הוא פשוט אינו על המצבת של אותו אימון.
--
-- תאריך סיום ריק = היעדרות פתוחה, מהתאריך הזה עד שמישהו יסגור אותה.

alter table people add column if not exists absent_from date;
alter table people add column if not exists absent_to   date;

comment on column people.absent_from is 'תחילת היעדרות — קורס, אשפוז, חו״ל';
comment on column people.absent_to   is 'סוף ההיעדרות; ריק = פתוחה';

grant select (absent_from, absent_to) on people to authenticated;


-- ── מי על המצבת של אימון ───────────────────────────────────────────────────
--
-- אותה רשימה שממנה יוצאות התזכורות, נספרת הנוכחות ומחושבים הציונים. מי
-- שבהיעדרות באותו יום — אינו בה, גם לא כאורח.

create or replace function is_absent_on(pid uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.absent_from is not null
       and d >= p.absent_from
       and (p.absent_to is null or d <= p.absent_to)
    from people p where p.id = pid), false)
$$;

create or replace function training_participants(tid uuid)
returns setof people
language sql stable security definer set search_path = public as $$
  select p.* from people p, trainings t
  where t.id = tid and p.status = 'active' and p.team_id is not null
    and (t.team_id = 'joint'
         or p.team_id::text = t.team_id::text
         or exists (select 1 from teams tm where tm.id = p.team_id and tm.attends_all))
    and not is_absent_on(p.id, t.date)
  union
  select p.* from people p
   join training_guests g on g.person_id = p.id
   join trainings t on t.id = g.training_id
  where g.training_id = tid and p.status = 'active'
    and not is_absent_on(p.id, t.date)
$$;

grant execute on function is_absent_on(uuid, date) to authenticated;


-- ── תצוגת הכרטיסים, מחדש ───────────────────────────────────────────────────
--
-- שתי העמודות החדשות נכנסות באמצע, ו-create or replace יודע רק להוסיף בסוף.

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
  p.absent_from,
  p.absent_to,
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


-- ── סוג האימון נשמר גם ביצירה ──────────────────────────────────────────────
--
-- הבחירה בין רטוב, חלקי ויבש נשמרה רק בעריכה: הפונקציה שיוצרת אימון לא
-- כתבה את העמודה בכלל, וכל אימון חדש נולד ״רטוב״ בלי קשר למה שנבחר בטופס.

create or replace function create_trainings(drafts jsonb, replace_existing boolean default false)
returns setof uuid
language plpgsql security definer set search_path = public as $$
declare d jsonb; tid uuid; row_json jsonb; i int; first_vehicle uuid; medic uuid;
begin
  if not (is_admin() or is_team_cmd()) then
    raise exception 'יצירת אימון שמורה למפקדי הצוותים, מפקד החפ״ק ומנהל המערכת';
  end if;
  if replace_existing then
    if not is_admin() then raise exception 'החלפת כל התבנית שמורה למנהל המערכת ולמפקד החפ״ק'; end if;
    delete from trainings where status <> 'done';
  end if;

  for d in select * from jsonb_array_elements(drafts) loop
    insert into trainings (
      team_id, topic_id, date, end_date, start_time, end_time, location, coords,
      instructor_id, commander_id, inst_status, cmd_status,
      inst_invited_at, cmd_invited_at, status, freq, safety, pickup, departure, notes,
      fire_mode)
    values (
      (d->>'team_id')::training_team, d->>'topic_id', (d->>'date')::date,
      nullif(d->>'end_date','')::date, d->>'start_time', d->>'end_time',
      coalesce(d->>'location',''), coalesce(d->>'coords',''),
      nullif(d->>'instructor_id','')::uuid, nullif(d->>'commander_id','')::uuid,
      coalesce((d->>'inst_status')::invite_status, 'pending'),
      coalesce((d->>'cmd_status')::invite_status, 'pending'),
      case when nullif(d->>'instructor_id','') is null then null else now() end,
      case when nullif(d->>'commander_id','') is null then null else now() end,
      coalesce((d->>'status')::training_status, 'planned'),
      coalesce(d->>'freq', 'רשת חפ״ק: ערוץ 3 · חלופי: ערוץ 7'),
      coalesce(d->>'safety',''), coalesce(d->>'pickup','שער בסיס האם'),
      coalesce(d->>'departure','05:30'), coalesce(d->>'notes',''),
      coalesce(nullif(d->>'fire_mode',''), 'wet'))
    returning id into tid;

    i := 0;
    for row_json in select * from jsonb_array_elements(coalesce(d->'day_blocks','[]'::jsonb)) loop
      insert into day_blocks (training_id, time, title, sort)
      values (tid, row_json->>'time', row_json->>'title', i);
      i := i + 1;
    end loop;

    i := 0;
    for row_json in select * from jsonb_array_elements(coalesce(d->'gear','[]'::jsonb)) loop
      insert into gear_items (training_id, name, qty, sort)
      values (tid, row_json->>'name', (row_json->>'qty')::int, i);
      i := i + 1;
    end loop;

    i := 0;
    for row_json in select * from jsonb_array_elements(coalesce(d->'vehicles','[]'::jsonb)) loop
      insert into vehicles (training_id, type, tz, driver_id, seats, departure, fitness, fault, sort)
      values (tid, row_json->>'type', coalesce(row_json->>'tz',''),
              nullif(row_json->>'driver_id','')::uuid, (row_json->>'seats')::int,
              row_json->>'departure',
              coalesce(nullif(row_json->>'fitness','')::vehicle_fitness, 'כשיר'),
              coalesce(row_json->>'fault',''), i);
      i := i + 1;
    end loop;

    i := 0;
    for row_json in select * from jsonb_array_elements(coalesce(d->'ammo','[]'::jsonb)) loop
      insert into ammo (training_id, weapon, per_fighter, allocated, sort)
      values (tid, row_json->>'weapon', (row_json->>'per_fighter')::int,
              (row_json->>'allocated')::int, i);
      i := i + 1;
    end loop;

    i := 0;
    for row_json in select * from jsonb_array_elements(coalesce(d->'food','[]'::jsonb)) loop
      insert into food (training_id, name, qty, unit, note, sort)
      values (tid, row_json->>'name', (row_json->>'qty')::int,
              coalesce(row_json->>'unit','יח׳'), coalesce(row_json->>'note',''), i);
      i := i + 1;
    end loop;

    -- evacuation vehicle and duty medic default to the first sensible choice
    select id into first_vehicle from vehicles where training_id = tid order by sort limit 1;
    select p.id into medic from training_participants(tid) p where p.role = 'חובש' limit 1;
    update trainings set evac_vehicle_id = first_vehicle, medic_id = medic where id = tid;

    if (d->>'status') = 'published' then
      perform notify('אימון חדש פורסם. הנוכחות פתוחה לסימון.',
                     array(select id from training_participants(tid)), tid, 'changed');
    end if;

    return next tid;
  end loop;
end $$;

grant execute on function create_trainings(jsonb, boolean) to authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- patch-07-sight.sql
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 7 — כוונת אישית, לצד הנשק והאמר״ל
--
--  להריץ אחרי 06. בטוח להרצה חוזרת.
--
--  לכל לוחם נרשמת גם הכוונת שלו — סוג וצ׳ — והיא נכנסת לדו״ח הצל״ם באותה
--  שורה עם הנשק והאמר״ל. הצ׳ מוסתר כמו כל צ׳ אחר: רואים אותו בעליו,
--  המפקדים, וסמל הצוות — שהוא זה שרושם אותו.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── העמודות ────────────────────────────────────────────────────────────────

alter table people add column if not exists sight        text not null default '';
alter table people add column if not exists sight_serial text not null default '';

comment on column people.sight is 'סוג הכוונת האישית';
comment on column people.sight_serial is 'צ׳ של הכוונת';

grant select (sight, sight_serial) on people to authenticated;


-- ── סמל הצוות רושם גם אותה ─────────────────────────────────────────────────
--
-- מדיניות השורות קובעת על מי מותר לו; זה קובע אילו עמודות. בלי שתי העמודות
-- החדשות ברשימה הוא היה נחסם ברגע שירשום כוונת.

create or replace function guard_people_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  own      text[] := array['notif', 'updated_at'];
  kit      text[] := array['weapon', 'weapon_serial', 'nvg', 'nvg_serial',
                           'sight', 'sight_serial', 'certs', 'updated_at'];
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
      raise exception 'סמל צוות רשאי לעדכן נשק, אמר״ל, כוונת והכשרות בלבד';
    end if;
    return new;
  end if;

  raise exception 'אין הרשאה לערוך לוחם אחר';
end $$;


-- ── תצוגת הכרטיסים, מחדש ───────────────────────────────────────────────────
--
-- הצ׳ של הכוונת מוסתר כמו הצ׳ של הנשק והאמר״ל, ומאותה סיבה.

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
  p.absent_from,
  p.absent_to,
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
  end as nvg_serial,
  p.sight,
  case
    when can_see_pn() or p.id = me_id() or is_sergeant() then p.sight_serial
    else ''
  end as sight_serial
from people p
where me_id() is not null or auth.uid() is null;

grant select on people_view to authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- patch-08-npak.sql
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 8 — נפ״ק: מי נוסע באיזה רכב
--
--  להריץ אחרי 07. בטוח להרצה חוזרת.
--
--  לכל אימון אפשר להוציא נפ״ק: רכב, נהג, ומי יושב בו — ולשלוח אותו
--  בוואטסאפ. מה שהוצא נשמר כפי שהיה, עם התאריך והשעה ומי הוציא אותו,
--  כי זה בדיוק מה שמחפשים אחר כך: מי נסע במה, ומתי.
--
--  השורות נשמרות כצילום ולא כהפניות: שם, מספר אישי ותפקיד כפי שהיו באותו
--  רגע. לוחם שיעבור צוות מחר לא ישנה נפ״ק שכבר יצא.
-- ═══════════════════════════════════════════════════════════════════════════


create table if not exists npak (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid references trainings (id) on delete set null,
  issued_at   timestamptz not null default now(),
  issued_by   uuid references people (id) on delete set null,
  rows        jsonb not null default '[]'::jsonb
);

comment on table npak is 'נפ״ק שהוצא: מי נוסע באיזה רכב, כפי שהיה באותו רגע';
comment on column npak.rows is
  '[{type, tz, seats, driver:{name,pn,role}, people:[{name,pn,role}]}]';

create index if not exists npak_training_idx on npak (training_id);
create index if not exists npak_issued_idx   on npak (issued_at desc);

alter table npak enable row level security;

-- הנפ״ק מלא מספרים אישיים, ולכן הוא נקרא ונכתב על ידי מי שרשאי לראות אותם:
-- מנהל מערכת, מפקד חפ״ק, מפקדי צוותים ומפקד האימון עצמו.
drop policy if exists npak_read on npak;
create policy npak_read on npak for select to authenticated
  using (is_admin() or is_team_cmd() or is_training_cmd(training_id));

drop policy if exists npak_write on npak;
create policy npak_write on npak for insert to authenticated
  with check (is_admin() or is_team_cmd() or is_training_cmd(training_id));

-- נפ״ק שיצא הוא רשומה היסטורית; מחיקה שמורה למנהל המערכת
drop policy if exists npak_delete on npak;
create policy npak_delete on npak for delete to authenticated
  using (is_admin());

grant select, insert on npak to authenticated;
grant delete on npak to authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- patch-09-staff.sql
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 9 — המפקדה היא תקן, לא מקום לחנות בו אנשים
--
--  להריץ אחרי 08. בטוח להרצה חוזרת.
--
--  במפקדה עומדים מח״ט וסמח״ט, ולצידם מי שמנהל את המערכת — מנהל המערכת
--  ומפקד החפ״ק — מתוקף תפקידם. כל אחד אחר שייך לצוות.
--
--  ומי שמשבץ למפקדה הוא מנהל המערכת או מפקד החפ״ק בלבד: זה שינוי במבנה
--  היחידה, לא שינוי פרטים.
-- ═══════════════════════════════════════════════════════════════════════════


create or replace function guard_staff_seat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- שייך לצוות? אין כאן מה לבדוק.
  if new.team_id is not null then return new; end if;

  -- השרת פועל בשם עצמו במסלולי הכניסה, ואין לו טוקן
  if auth.uid() is null then return new; end if;

  -- מי שכבר היה במפקדה ולא זז ממנה — לא נוגעים בו בעדכון של משהו אחר
  if tg_op = 'UPDATE' and old.team_id is null
     and new.role = old.role
     and new.is_admin = old.is_admin
     and new.is_hapak_commander = old.is_hapak_commander then
    return new;
  end if;

  if not (is_admin() or coalesce((select is_hapak_commander from people where auth_id = auth.uid()), false)) then
    raise exception 'רק מנהל מערכת או מפקד חפ״ק יכולים לשבץ למפקדה';
  end if;

  if not (new.is_admin or new.is_hapak_commander or new.role in ('מח״ט', 'סמח״ט')) then
    raise exception 'למפקדה משובצים מח״ט וסמח״ט בלבד, מעבר למנהל המערכת ומפקד החפ״ק';
  end if;

  return new;
end $$;

drop trigger if exists people_staff_guard on people;
create trigger people_staff_guard before insert or update on people
  for each row execute function guard_staff_seat();


-- ───────────────────────────────────────────────────────────────────────────
-- patch-10-one-mahat.sql
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 10 — מח״ט אחד, סמח״ט אחד, ובהזנה ידנית בלבד
--
--  להריץ אחרי 09. בטוח להרצה חוזרת.
--
--  בחטיבה יש מח״ט אחד וסמח״ט אחד. שני התפקידים אינם בחירה בטופס: מזין
--  אותם מנהל המערכת או מפקד החפ״ק, ביד, ואין שניים מאותו סוג.
--
--  אם כרגע יש אצלך יותר מאחד — הקובץ יעצור ויגיד מי הם, בלי לשנות כלום.
--  תחליט מי נשאר, ותריץ שוב.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── רק אחד מכל אחד ─────────────────────────────────────────────────────────
--
-- אינדקס ייחודי חלקי לכל תפקיד בנפרד. שני אינדקסים ולא אחד: אינדקס אחד על
-- שניהם היה מתיר רק שורה אחת בסך הכול.

do $$
declare dup text;
begin
  select string_agg(role || ': ' || cnt, ', ') into dup
    from (select role, count(*) as cnt from people
           where role in ('מח״ט', 'סמח״ט') group by role having count(*) > 1) x;
  if dup is not null then
    raise exception 'יש יותר מאחד — %. שנה תפקיד למי שאינו אמור להיות שם, והרץ שוב.', dup;
  end if;
end $$;

create unique index if not exists people_one_mahat  on people (role) where role = 'מח״ט';
create unique index if not exists people_one_smahat on people (role) where role = 'סמח״ט';


-- ── ומי רשאי לשבץ אותם ─────────────────────────────────────────────────────
--
-- אותה שמירה שכבר עומדת בשער המפקדה, מורחבת לתפקיד עצמו: מח״ט וסמח״ט הם
-- מבנה היחידה, ולא שדה שממלאים בטופס הצטרפות.

create or replace function guard_staff_seat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  boss boolean;
begin
  -- השרת פועל בשם עצמו במסלולי הכניסה, ואין לו טוקן
  if auth.uid() is null then return new; end if;

  boss := is_admin()
       or coalesce((select is_hapak_commander from people where auth_id = auth.uid()), false);

  -- התפקיד עצמו: מוזן ביד, ורק על ידי מי שאחראי למבנה
  if new.role in ('מח״ט', 'סמח״ט')
     and (tg_op = 'INSERT' or new.role is distinct from old.role)
     and not boss then
    raise exception 'רק מנהל מערכת או מפקד חפ״ק יכולים לשבץ מח״ט או סמח״ט';
  end if;

  -- שייך לצוות? מכאן אין מה לבדוק.
  if new.team_id is not null then return new; end if;

  -- מי שכבר היה במפקדה ולא זז ממנה — לא נוגעים בו בעדכון של משהו אחר
  if tg_op = 'UPDATE' and old.team_id is null
     and new.role = old.role
     and new.is_admin = old.is_admin
     and new.is_hapak_commander = old.is_hapak_commander then
    return new;
  end if;

  if not boss then
    raise exception 'רק מנהל מערכת או מפקד חפ״ק יכולים לשבץ למפקדה';
  end if;

  if not (new.is_admin or new.is_hapak_commander or new.role in ('מח״ט', 'סמח״ט')) then
    raise exception 'למפקדה משובצים מח״ט וסמח״ט בלבד, מעבר למנהל המערכת ומפקד החפ״ק';
  end if;

  return new;
end $$;

drop trigger if exists people_staff_guard on people;
create trigger people_staff_guard before insert or update on people
  for each row execute function guard_staff_seat();


-- ───────────────────────────────────────────────────────────────────────────
-- patch-11-own-kit.sql
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 11 — כל אחד מעדכן את הציוד של עצמו
--
--  להריץ אחרי 10. בטוח להרצה חוזרת.
--
--  הצ׳ים שלוחם חתום עליהם — נשק, אמר״ל וכוונת — הם שלו לתחזק. עד עכשיו רק
--  סמל צוות ומעלה יכלו לגעת בהם, וכל תיקון של ספרה עבר דרך מישהו אחר.
--
--  ההסמכות נשארות של המפקדים: תאריך תפוגה הוא לא משהו שכותב מי שהוא חל
--  עליו. וכל השאר — דרגה, תפקיד, צוות, הרשאות — כמו שהיה.
-- ═══════════════════════════════════════════════════════════════════════════


create or replace function guard_people_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  -- מה שכל אחד משנה בכרטיס של עצמו: ההעדפות, והצ׳ים שהוא חתום עליהם
  own      text[] := array['notif', 'updated_at',
                           'weapon', 'weapon_serial', 'nvg', 'nvg_serial',
                           'sight', 'sight_serial'];
  -- ומה שסמל הצוות משנה אצל אחרים, ובכרטיס שלו: אותם, ועוד ההסמכות
  kit      text[] := array['weapon', 'weapon_serial', 'nvg', 'nvg_serial',
                           'sight', 'sight_serial', 'certs', 'updated_at'];
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
      raise exception 'סמל צוות רשאי לעדכן נשק, אמר״ל, כוונת והכשרות בלבד';
    end if;
    return new;
  end if;

  raise exception 'אין הרשאה לערוך לוחם אחר';
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- patch-12-staff-joins.sql
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 12 — מי שבמפקדה מצטרף לאימון בעצמו
--
--  להריץ אחרי 11. בטוח להרצה חוזרת.
--
--  המפקדה אינה שייכת לצוות, ולכן אף אימון אינו "שלה" — ועד עכשיו זה אמר
--  שמי שעומד בה צריך שמישהו יצרף אותו. זה הפוך מהמציאות: מח״ט שמחליט
--  לבוא לאימון בא אליו.
--
--  מכאן: מי שאינו משובץ לצוות מצרף את עצמו לכל אימון, ומסיר את עצמו.
--  את מי שכן משובץ לצוות ממשיך לצרף מפקד צוות ומעלה, כמו קודם.
-- ═══════════════════════════════════════════════════════════════════════════


create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select team_id is null and status = 'active'
      from people where auth_id = auth.uid()), false)
$$;

grant execute on function is_staff() to authenticated;

drop policy if exists guests_write on training_guests;
create policy guests_write on training_guests for all to authenticated
  using (is_admin() or is_team_cmd() or (is_staff() and person_id = me_id()))
  with check (is_admin() or is_team_cmd() or (is_staff() and person_id = me_id()));


-- ───────────────────────────────────────────────────────────────────────────
-- patch-13-agam.sql
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 13 — קצין אג״ם במפקדה, תקן אחד
--
--  להריץ אחרי 12. בטוח להרצה חוזרת.
--
--  קצין אג״ם עומד במפקדה לצד המח״ט והסמח״ט, ובאותם כללים בדיוק: אחד ולא
--  יותר, מוזן ביד על ידי מנהל המערכת או מפקד החפ״ק בלבד, ואינו בחירה בטופס
--  הצטרפות. כמו כל מי שבמפקדה הוא אינו שייך לצוות, ולכן מצרף את עצמו לכל
--  אימון שהוא מחליט להגיע אליו.
--
--  אם כרגע יש אצלך יותר מאחד — הקובץ יעצור ויגיד כמה, בלי לשנות כלום.
--  תחליט מי נשאר, ותריץ שוב.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── אחד ולא יותר ───────────────────────────────────────────────────────────

do $$
declare n integer;
begin
  select count(*) into n from people where role = 'קצין אג״ם';
  if n > 1 then
    raise exception 'יש % קציני אג״ם. שנה תפקיד למי שאינו אמור להיות שם, והרץ שוב.', n;
  end if;
end $$;

create unique index if not exists people_one_agam on people (role) where role = 'קצין אג״ם';


-- ── ומי רשאי לשבץ אותו ─────────────────────────────────────────────────────
--
-- אותה שמירה של עדכון 10, עם תפקיד שלישי ברשימה. שלושת התפקידים מוחזקים
-- כאן במקום אחד (`staff_roles`) כדי שהוספת תקן רביעי בעתיד תהיה שינוי של
-- שורה אחת ולא ציד אחרי מחרוזות בשלושה מקומות בפונקציה.

create or replace function guard_staff_seat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  boss        boolean;
  staff_roles text[] := array['מח״ט', 'סמח״ט', 'קצין אג״ם'];
begin
  -- השרת פועל בשם עצמו במסלולי הכניסה, ואין לו טוקן
  if auth.uid() is null then return new; end if;

  boss := is_admin()
       or coalesce((select is_hapak_commander from people where auth_id = auth.uid()), false);

  -- התפקיד עצמו: מוזן ביד, ורק על ידי מי שאחראי למבנה
  if new.role = any (staff_roles)
     and (tg_op = 'INSERT' or new.role is distinct from old.role)
     and not boss then
    raise exception 'רק מנהל מערכת או מפקד חפ״ק יכולים לשבץ מח״ט, סמח״ט או קצין אג״ם';
  end if;

  -- שייך לצוות? מכאן אין מה לבדוק.
  if new.team_id is not null then return new; end if;

  -- מי שכבר היה במפקדה ולא זז ממנה — לא נוגעים בו בעדכון של משהו אחר
  if tg_op = 'UPDATE' and old.team_id is null
     and new.role = old.role
     and new.is_admin = old.is_admin
     and new.is_hapak_commander = old.is_hapak_commander then
    return new;
  end if;

  if not boss then
    raise exception 'רק מנהל מערכת או מפקד חפ״ק יכולים לשבץ למפקדה';
  end if;

  if not (new.is_admin or new.is_hapak_commander or new.role = any (staff_roles)) then
    raise exception 'למפקדה משובצים מח״ט, סמח״ט וקצין אג״ם בלבד, מעבר למנהל המערכת ומפקד החפ״ק';
  end if;

  return new;
end $$;

drop trigger if exists people_staff_guard on people;
create trigger people_staff_guard before insert or update on people
  for each row execute function guard_staff_seat();


-- ───────────────────────────────────────────────────────────────────────────
-- הרשאות הקריאה על התצוגות, אחרי שנבנו מחדש
--
-- תצוגה שנמחקה ונבנתה מחדש מאבדת את ההרשאות שלה. בלי השורות האלה אף אחד לא
-- היה רואה שמות עד ההדבקה הבאה — ומי שלא נכנס למערכת היה עלול כן לראות.
-- ───────────────────────────────────────────────────────────────────────────

grant select on people_view to authenticated;
grant select on trainings_view to authenticated;
revoke all on people_view from anon;
revoke all on trainings_view from anon;
