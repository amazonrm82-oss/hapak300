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
