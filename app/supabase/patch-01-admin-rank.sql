-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 1 — תיקוני כניסה והזמנות, צי רכבים, ואבטחה
--
--  להדבקה ב-SQL Editor של Supabase (New query → Paste → Run) על בסיס נתונים
--  שכבר הוקם. בטוח להריץ שוב ושוב, ולא נוגע בשום נתון קיים.
--
--  אחרי ההרצה: השורה האחרונה בקובץ מסתיימת ב-
--    where me_id() is not null or auth.uid() is null;
--  אם מה שהדבקת נגמר אחרת — הדבקת רק חלק מהקובץ.
--
--  מה נכנס כאן:
--
--  1. מנהל מערכת מעל מפקד החפ״ק — שניהם מנהלים את היחידה, אבל רק מנהל מערכת
--     יכול לערוך מנהל מערכת, למנות אחד, להסיר אחד או לאפס לו את קוד הכניסה.
--
--  2. תיקון באג ההזמנות — ביטוי CASE מחזיר טקסט, ו-Postgres אינו ממיר טקסט
--     לעמודת enum מעצמו. לכן גם הזמנת מדריך וגם אישור ההזמנה נכשלו. כאן זה
--     מתוקן עם המרה מפורשת.
--
--  3. צי הרכבים — טבלה חדשה: רושמים רכב פעם אחת עם הצ׳ שלו, ומכאן בוחרים
--     אותו מרשימה בכל אימון במקום להקליד מחדש.
--
--  4. תיקון הכניסה — הקוד בן 4 הספרות לא נשמר בכלל, ולכן כל כניסה נראתה
--     ככניסה ראשונה וביקשה לבחור קוד מחדש. אחרי העדכון הקוד נשמר, ובכניסה
--     הבאה נדרשים רק מספר אישי + הקוד שנבחר.
--
--  5. בקשת הצטרפות — מעכשיו קופצת כהתראה למנהל המערכת ולמפקד החפ״ק ברגע
--     שהיא נשלחת, ולא רק מחכה במסך ״צוותים״.
--
--  6. חיזוק אבטחה:
--     · כתיבת התראה שמורה למי שמפקד על מה שמכריזים עליו. עד היום כל לוחם
--       מחובר יכול היה לשלוח ״האימון בוטל״ לכל היחידה.
--     · הפונקציה notify כבר אינה נגישה מהדפדפן — היא עקפה את אותה בדיקה.
--     · טופס ההצטרפות הפתוח מוגבל: בקשה כפולה, מספר אישי קיים, מספר לא תקין
--       או הצפה נדחים.
--     · מגבלת קצב לכל קורא, שבה משתמשים מסלולי הכניסה — כדי שאי אפשר יהיה
--       לסרוק מספרים אישיים ממכשיר אחד.
--
--  7. ניתוק מכשירים ויומן פעולות:
--     · אפשר לנתק מכשיר שכבר מחובר — איפוס קוד עושה זאת אוטומטית, ויש גם
--       ״ניתוק כל המכשירים״ בטופס הלוחם. עד היום טלפון שאבד נשאר מחובר.
--     · לוחם שהושבת מאבד גישה מיד, ולא רק בכניסה הבאה.
--     · יומן פעולות שנכתב בבסיס הנתונים ואי אפשר לערוך או למחוק ממנו.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. סדר הדרגות ─────────────────────────────────────────────────────────

create or replace function is_sysadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from people where auth_id = auth.uid()), false)
$$;

create or replace function guard_admin_rank() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- אין JWT של משתמש: זה השרת פועל בשם עצמו (למשל רישום auth_id בכניסה
  -- הראשונה). סשן רגיל לא יכול להגיע לכאן בלי JWT — ההרשאות ניתנות ל-
  -- authenticated בלבד.
  if auth.uid() is null or is_sysadmin() then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    if old.is_admin then
      raise exception 'רק מנהל מערכת יכול להסיר מנהל מערכת';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.is_admin then
    raise exception 'רק מנהל מערכת יכול לערוך מנהל מערכת';
  end if;

  if new.is_admin then
    raise exception 'רק מנהל מערכת יכול למנות מנהל מערכת';
  end if;

  return new;
end $$;

drop trigger if exists people_admin_rank_guard on people;
create trigger people_admin_rank_guard before insert or update or delete on people
  for each row execute function guard_admin_rank();

create or replace function reset_pin(pid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'איפוס קוד כניסה שמור למנהל המערכת ולמפקד החפ״ק';
  end if;
  -- איפוס קוד הוא דרך כניסה לחשבון, ולכן סדר הדרגות תקף גם כאן
  if not is_sysadmin() and (select is_admin from people where id = pid) then
    raise exception 'רק מנהל מערכת יכול לאפס את קוד הכניסה של מנהל מערכת';
  end if;
  update people set pin_hash = null, pin_set_at = null where id = pid;
  delete from login_attempts where pn = (select pn from people where id = pid);
end $$;

grant execute on function reset_pin(uuid) to authenticated;


-- ── 2. תיקון ההזמנות ──────────────────────────────────────────────────────

create or replace function invite_person(tid uuid, role text, pid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare actor uuid := me_id(); self boolean;
begin
  if not (is_admin() or is_team_cmd_of(tid) or is_training_cmd(tid)) then
    raise exception 'הזמנת מדריך או מפקד אימון שמורה למפקדים';
  end if;
  self := pid = actor;
  if role = 'instructor' then
    update trainings set instructor_id = pid,
                         inst_status = (case when self then 'accepted' else 'pending' end)::invite_status,
                         inst_invited_at = now()
     where id = tid;
  else
    update trainings set commander_id = pid,
                         cmd_status = (case when self then 'accepted' else 'pending' end)::invite_status,
                         cmd_invited_at = now()
     where id = tid;
  end if;

  if not self then
    perform notify(
      format('הוזמנת ל%s אימון. נדרש מענה תוך %s שעות.',
             case when role = 'instructor' then 'הדריך' else 'פקד על' end,
             (select invite_hours from settings where id)),
      array[pid, actor], tid);
  end if;
end $$;

create or replace function respond_invite(tid uuid, role text, accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare actor uuid := me_id(); ok boolean; leaders uuid[];
begin
  select case when role = 'instructor' then instructor_id = actor else commander_id = actor end
    into ok from trainings where id = tid;
  if not coalesce(ok, false) then raise exception 'ההזמנה אינה שלך'; end if;

  if role = 'instructor' then
    update trainings set inst_status = (case when accept then 'accepted' else 'declined' end)::invite_status where id = tid;
  else
    update trainings set cmd_status  = (case when accept then 'accepted' else 'declined' end)::invite_status where id = tid;
  end if;

  select array_remove(array_agg(distinct x), null) into leaders from (
    select commander_id as x from trainings where id = tid
    union select t.commander_id from teams t
      where t.id::text = (select team_id::text from trainings where id = tid)
    union select id from people where is_admin or is_hapak_commander
  ) s;

  perform notify(
    format('%s %s את ההזמנה ל%s האימון.%s',
      (select rank || ' ' || name from people where id = actor),
      case when accept then 'אישר' else 'דחה' end,
      case when role = 'instructor' then 'הדריך' else 'פקד על' end,
      case when accept then '' else ' המערכת מציעה מחליף.' end),
    leaders, tid);
end $$;

create or replace function approve_join_request(jid uuid, accept boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare j join_requests; new_id uuid;
begin
  if not is_admin() then raise exception 'אישור בקשות הצטרפות שמור למנהל המערכת ולמפקד החפ״ק'; end if;
  select * into j from join_requests where id = jid;
  if not found then raise exception 'הבקשה לא נמצאה'; end if;

  update join_requests set status = (case when accept then 'approved' else 'rejected' end)::join_status where id = jid;
  if not accept then return null; end if;

  insert into people (team_id, rank, name, role, pn, phone, rating)
  values (j.team_id, j.rank, j.name, j.role, j.pn, j.phone, 7)
  returning id into new_id;
  return new_id;
end $$;


-- ── 3. צי הרכבים ──────────────────────────────────────────────────────────

create table if not exists fleet (
  id       uuid primary key default gen_random_uuid(),
  tz       text not null unique,
  type     text not null,
  seats    int  not null default 6,
  fitness  vehicle_fitness not null default 'כשיר',
  note     text not null default '',
  active   boolean not null default true,
  sort     int  not null default 0,
  created_at timestamptz not null default now()
);

alter table fleet enable row level security;

drop policy if exists fleet_read on fleet;
drop policy if exists fleet_write on fleet;
create policy fleet_read on fleet for select to authenticated using (true);
create policy fleet_write on fleet for all to authenticated
  using (is_admin() or is_team_cmd()) with check (is_admin() or is_team_cmd());

grant select, insert, update, delete on fleet to authenticated;

do $$
begin
  alter publication supabase_realtime add table fleet;
exception when duplicate_object then null;
end $$;

-- הרכב שיוצא לאימון נשמר כהעתק, כדי שרשומת האימון תישאר נכונה גם אם הרכב
-- שונה או הוצא מהצי בהמשך. כאן נוספת גם הכשירות שנבחרה בטופס.
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
      inst_invited_at, cmd_invited_at, status, freq, safety, pickup, departure, notes)
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
      coalesce(d->>'departure','05:30'), coalesce(d->>'notes',''))
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


-- לבדיקה שהעדכון נקלט:
--   select tgname from pg_trigger where tgname = 'people_admin_rank_guard';
--   select count(*) from fleet;


-- ── 4. תיקון שמירת קוד הכניסה ─────────────────────────────────────────────
--
-- מסלולי הכניסה כותבים pin_hash ו-auth_id עם מפתח השרת, שאין לו JWT של
-- משתמש. הטריגר הזה דחה בדיוק את זה, ולכן הקוד שהלוחם בחר לא נשמר מעולם
-- והמערכת ביקשה לבחור קוד שוב בכל כניסה.

create or replace function guard_people_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
-- Everything except these is the commander's to change. Comparing the whole
-- row rather than a list of columns means a column added later is protected
-- from the moment it exists — the earlier version listed the fields by hand,
-- so `weapon_serial` and `medical_profile` were briefly a fighter's own to
-- edit, and any future field would have been too.
declare allowed text[] := array['notif', 'updated_at'];
begin
  -- no end-user JWT: the server acting for itself (the login routes write
  -- `pin_hash` and `auth_id` with the service key, which carries no token)
  if auth.uid() is null then return new; end if;
  if is_admin() then return new; end if;
  if new.id <> me_id() then
    raise exception 'אין הרשאה לערוך לוחם אחר';
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'רק מנהל מערכת או מפקד החפ״ק יכולים לשנות פרטים, הרשאות והסמכות';
  end if;
  return new;
end $$;

-- לבדיקה: אחרי הרצת העדכון, היכנס פעם אחת ובחר קוד — ובכניסה הבאה המערכת
-- תבקש רק את הקוד. אפשר גם לוודא ישירות:
--   select name, pin_hash is not null as has_pin from people;


-- ── 5. התראה על בקשת הצטרפות ──────────────────────────────────────────────

-- ── a join request reaches a person ────────────────────────────────────────
-- The request is submitted from the login screen, by someone with no account
-- and no session, so the notification cannot come from the browser: an
-- anonymous client may insert the request and nothing else. The database
-- raises it instead, addressed to the administrators and the HQ-party
-- commander — the only people who can approve it.
create or replace function notify_join_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare leaders uuid[];
begin
  if new.status <> 'pending' then return new; end if;

  select array_remove(array_agg(id), null) into leaders
    from people where (is_admin or is_hapak_commander) and status = 'active';
  if array_length(leaders, 1) is null then return new; end if;

  perform notify(
    format('בקשת הצטרפות חדשה: %s %s · %s · מ.א. %s · %s — לאישור במסך ״צוותים״.',
           new.rank, new.name, new.role, new.pn,
           coalesce((select name from teams where id = new.team_id), '')),
    leaders, null, 'general');
  return new;
end $$;

drop trigger if exists join_requests_notify on join_requests;
create trigger join_requests_notify after insert on join_requests
  for each row execute function notify_join_request();


-- ── 6. חיזוק אבטחה ────────────────────────────────────────────────────────

-- כתיבת התראה היא דיבור בשם היחידה: ההודעה נוחתת אצל כולם, ועם פוש — גם על
-- מסך הנעילה. עד כה הסעיף האחרון במדיניות היה `me_id() is not null`, כלומר
-- נכון עבור כל לוחם מחובר.
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications for insert to authenticated
  with check (
    is_admin()
    or is_team_cmd()
    or (training_id is not null
        and (is_training_cmd(training_id) or is_training_instr(training_id)))
  );

-- notify היא SECURITY DEFINER וכותבת ישירות לטבלה, כלומר עוקפת את המדיניות
-- שלמעלה. היא נועדה לשימוש הפונקציות האחרות בלבד.
revoke execute on function notify(text, uuid[], uuid, text) from authenticated, anon, public;


create or replace function guard_join_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare pending int;
begin
  if new.pn !~ '^[0-9]{7}$' then
    raise exception 'מספר אישי חייב להיות 7 ספרות';
  end if;
  if length(btrim(new.name)) < 2 then
    raise exception 'נדרש שם מלא';
  end if;
  -- One message for both "already a member" and "already applied". Telling
  -- them apart would turn this open form into a way of asking whether a given
  -- personal number belongs to someone in the unit.
  if exists (select 1 from people where pn = new.pn)
     or exists (select 1 from join_requests where pn = new.pn and status = 'pending') then
    raise exception 'לא ניתן לשלוח בקשה עבור המספר האישי הזה כרגע. אם כבר יש לך גישה — היכנס עם המספר האישי שלך.';
  end if;

  select count(*) into pending from join_requests where status = 'pending';
  if pending >= 100 then
    raise exception 'יש יותר מדי בקשות ממתינות. פנה למנהל המערכת.';
  end if;

  -- a burst from one source: ten new requests in an hour is already unusual
  if (select count(*) from join_requests where at > now() - interval '1 hour') >= 10 then
    raise exception 'נשלחו יותר מדי בקשות בזמן קצר. נסה שוב בעוד שעה.';
  end if;

  new.name := btrim(new.name);
  new.phone := btrim(new.phone);
  return new;
end $$;

drop trigger if exists join_requests_guard on join_requests;
create trigger join_requests_guard before insert on join_requests
  for each row execute function guard_join_request();

-- מגבלת קצב לכל קורא. הנעילה לפי חשבון מונעת ניחוש קוד של לוחם אחד; זו
-- מונעת סריקה של כל מרחב המספרים האישיים ממכשיר אחד.
create table if not exists rate_limits (
  key       text primary key,
  hits      int not null default 0,
  window_at timestamptz not null default now()
);
alter table rate_limits enable row level security;  -- service role only

-- Returns true while the caller is still inside their allowance. One statement,
-- so two requests arriving together cannot both read the same count.
create or replace function bump_rate_limit(k text, max_hits int, window_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare cur rate_limits;
begin
  insert into rate_limits (key, hits, window_at) values (k, 1, now())
  on conflict (key) do update set
    hits = case when rate_limits.window_at < now() - make_interval(secs => window_seconds)
                then 1 else rate_limits.hits + 1 end,
    window_at = case when rate_limits.window_at < now() - make_interval(secs => window_seconds)
                then now() else rate_limits.window_at end
  returning * into cur;

  -- keep the table from growing without bound; the rows are worthless once cold
  delete from rate_limits where window_at < now() - interval '1 day';

  return cur.hits <= max_hits;
end $$;

grant execute on function bump_rate_limit(text, int, int) to service_role;

-- לבדיקה:
--   select bump_rate_limit('check', 2, 60);   -- true, true, ואז false


-- ── 7. ניתוק מכשירים ויומן פעולות ─────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- Accountability and session control.
--
-- Two things this system could not do until now: revoke access from a phone
-- that is already signed in, and say afterwards who changed something.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── revoking a session that is already open ────────────────────────────────
--
-- Resetting a fighter's code stopped them choosing a new one. It did not touch
-- the session already open on the phone in someone else's pocket, and marking
-- a fighter inactive only blocked the next login. Both were doors that stayed
-- open after they had been locked.
--
-- Every permission in this database is reached through the helpers below, so a
-- single check there covers all of them: a token is accepted only while the
-- person is active and the token was issued after their last revocation.

alter table people add column if not exists sessions_valid_from timestamptz
  not null default to_timestamp(0);

comment on column people.sessions_valid_from is
  'כל טוקן שהונפק לפני הרגע הזה נדחה. מתעדכן באיפוס קוד ובניתוק יזום.';

-- The row behind the current token, or nothing at all.
create or replace function me_row() returns people
language sql stable security definer set search_path = public as $$
  select p.* from people p
  where p.auth_id = auth.uid()
    and p.status = 'active'
    and coalesce((auth.jwt() ->> 'iat')::bigint, 0)
        >= floor(extract(epoch from p.sessions_valid_from))
$$;

create or replace function me_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from me_row()
$$;

create or replace function me() returns people
language sql stable security definer set search_path = public as $$
  select * from me_row()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or is_hapak_commander from me_row()), false)
$$;

create or replace function is_sysadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from me_row()), false)
$$;

create or replace function is_team_cmd() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_team_commander from me_row()), false)
$$;

create or replace function is_instructor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_instructor from me_row()), false)
$$;

create or replace function my_team() returns team_key
language sql stable security definer set search_path = public as $$
  select team_id from me_row()
$$;

-- Resetting the code now also ends every session that person has open.
create or replace function reset_pin(pid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'איפוס קוד כניסה שמור למנהל המערכת ולמפקד החפ״ק';
  end if;
  if not is_sysadmin() and (select is_admin from people where id = pid) then
    raise exception 'רק מנהל מערכת יכול לאפס את קוד הכניסה של מנהל מערכת';
  end if;
  update people
     set pin_hash = null, pin_set_at = null, sessions_valid_from = now()
   where id = pid;
  delete from login_attempts where pn = (select pn from people where id = pid);
end $$;

-- A lost phone: end every open session without touching the code.
create or replace function revoke_sessions(pid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'ניתוק מכשירים שמור למנהל המערכת ולמפקד החפ״ק';
  end if;
  if not is_sysadmin() and (select is_admin from people where id = pid) then
    raise exception 'רק מנהל מערכת יכול לנתק מנהל מערכת';
  end if;
  update people set sessions_valid_from = now() where id = pid;
end $$;

grant execute on function revoke_sessions(uuid) to authenticated;

-- ── the audit log ──────────────────────────────────────────────────────────
--
-- Who added a fighter, who granted a permission, who deleted a training, who
-- reset whose code. Written by a trigger rather than by the app, so it records
-- what actually happened in the database and not what the screen believed.

create table if not exists audit_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  actor_id  uuid,                       -- null = the server acting for itself
  actor     text not null default 'השרת',
  action    text not null,              -- הוספה | עדכון | מחיקה
  entity    text not null,              -- people | trainings | settings | fleet
  entity_id text,
  subject   text not null default '',   -- who or what it was
  detail    text not null default ''    -- which fields changed
);

create index if not exists audit_log_at_idx on audit_log (at desc);

alter table audit_log enable row level security;

-- Readable by the leadership; written only by the trigger below, which is
-- SECURITY DEFINER. No insert, update or delete policy exists on purpose:
-- an entry nobody can alter afterwards is the whole point of a log.
drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log for select to authenticated using (is_admin());

revoke all on audit_log from authenticated, anon;
grant select on audit_log to authenticated;

create or replace function write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := me_id();
  actor    text;
  subject  text := '';
  detail   text := '';
  changed  text[] := '{}';
  action   text;
begin
  actor := coalesce((select rank || ' ' || name from people where id = actor_id), 'השרת');
  action := case tg_op when 'INSERT' then 'הוספה' when 'DELETE' then 'מחיקה' else 'עדכון' end;

  if tg_table_name = 'people' then
    subject := coalesce(new.rank || ' ' || new.name, old.rank || ' ' || old.name, '');
    if tg_op = 'UPDATE' then
      if new.name is distinct from old.name then changed := array_append(changed, 'שם'); end if;
      if new.rank is distinct from old.rank then changed := array_append(changed, 'דרגה'); end if;
      if new.role is distinct from old.role then changed := array_append(changed, 'תפקיד'); end if;
      if new.team_id is distinct from old.team_id then changed := array_append(changed, 'צוות'); end if;
      if new.phone is distinct from old.phone then changed := array_append(changed, 'טלפון'); end if;
      if new.status is distinct from old.status then
        changed := array_append(changed, 'סטטוס → ' || new.status::text); end if;
      if new.rating is distinct from old.rating then changed := array_append(changed, 'דירוג'); end if;
      if new.qual is distinct from old.qual then changed := array_append(changed, 'הסמכות הדרכה'); end if;
      if new.certs is distinct from old.certs then changed := array_append(changed, 'הסמכות אישיות'); end if;
      if new.is_team_commander is distinct from old.is_team_commander then
        changed := array_append(changed, case when new.is_team_commander then 'מונה' else 'הוסר' end || ' מפקד צוות'); end if;
      if new.is_instructor is distinct from old.is_instructor then
        changed := array_append(changed, case when new.is_instructor then 'מונה' else 'הוסר' end || ' מדריך'); end if;
      if new.is_hapak_commander is distinct from old.is_hapak_commander then
        changed := array_append(changed, case when new.is_hapak_commander then 'מונה' else 'הוסר' end || ' מפקד חפ״ק'); end if;
      if new.is_admin is distinct from old.is_admin then
        changed := array_append(changed, case when new.is_admin then 'מונה' else 'הוסר' end || ' מנהל מערכת'); end if;
      if new.pin_hash is distinct from old.pin_hash and new.pin_hash is null then
        changed := array_append(changed, 'איפוס קוד כניסה'); end if;
      if new.sessions_valid_from is distinct from old.sessions_valid_from then
        changed := array_append(changed, 'ניתוק כל המכשירים'); end if;
      -- a login writing back auth_id, or a fighter's own notification switches:
      -- real, but not worth a line in a log people are meant to read
      if array_length(changed, 1) is null then return null; end if;
    end if;

  elsif tg_table_name = 'trainings' then
    subject := coalesce(new.date::text, old.date::text, '') || ' · ' ||
               coalesce(new.topic_id, old.topic_id, '');
    if tg_op = 'UPDATE' then
      if new.date is distinct from old.date then changed := array_append(changed, 'תאריך'); end if;
      if new.start_time is distinct from old.start_time
         or new.end_time is distinct from old.end_time then changed := array_append(changed, 'שעות'); end if;
      if new.location is distinct from old.location then changed := array_append(changed, 'מיקום'); end if;
      if new.status is distinct from old.status then
        changed := array_append(changed, 'סטטוס → ' || new.status::text); end if;
      if new.instructor_id is distinct from old.instructor_id then changed := array_append(changed, 'מדריך'); end if;
      if new.commander_id is distinct from old.commander_id then changed := array_append(changed, 'מפקד אימון'); end if;
      if new.approved_all is distinct from old.approved_all and new.approved_all then
        changed := array_append(changed, 'אישור נוכחות סופי'); end if;
      if array_length(changed, 1) is null then return null; end if;
    end if;

  elsif tg_table_name = 'settings' then
    subject := 'הגדרות המערכת';
    if new.allow_join is distinct from old.allow_join then
      changed := array_append(changed, case when new.allow_join then 'נפתחו' else 'נסגרו' end || ' בקשות הצטרפות'); end if;
    if new.period_name is distinct from old.period_name then changed := array_append(changed, 'שם התקופה'); end if;
    if new.period_start is distinct from old.period_start then changed := array_append(changed, 'תחילת התקופה'); end if;
    if array_length(changed, 1) is null then changed := array_append(changed, 'עודכנו'); end if;

  elsif tg_table_name = 'fleet' then
    subject := coalesce(new.type || ' צ׳ ' || new.tz, old.type || ' צ׳ ' || old.tz, '');
  end if;

  detail := array_to_string(changed, ', ');

  insert into audit_log (actor_id, actor, action, entity, entity_id, subject, detail)
  values (actor_id, actor, action, tg_table_name,
          coalesce(new.id, old.id)::text, subject, detail);
  return null;
end $$;

drop trigger if exists people_audit on people;
create trigger people_audit    after insert or update or delete on people
  for each row execute function write_audit();
drop trigger if exists trainings_audit on trainings;
create trigger trainings_audit after insert or update or delete on trainings
  for each row execute function write_audit();
drop trigger if exists settings_audit on settings;
create trigger settings_audit  after update on settings
  for each row execute function write_audit();
drop trigger if exists fleet_audit on fleet;
create trigger fleet_audit     after insert or update or delete on fleet
  for each row execute function write_audit();

-- ── the views run as their owner, so RLS never sees them ───────────────────
--
-- `people_view` and `trainings_view` are definer views: that is what lets them
-- mask the personal number while direct SELECT on `people` stays revoked. The
-- cost is that they answer anyone holding a valid-looking token, including one
-- that has just been revoked or belongs to a fighter marked inactive — the two
-- cases the section above exists to stop. The gate goes on the views too.
--
-- `auth.uid() is null` is the server acting for itself (the automations read
-- `trainings_view`); an anonymous caller cannot reach either view at all,
-- because neither is granted to `anon`.

-- Only if the view has not already been extended by a later patch: replacing
-- it with fewer columns is refused by Postgres outright, and running the
-- patches out of order should not be a trap.
do $view$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'people_view' and column_name = 'weapon'
  ) then
    execute $sql$
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
  p.updated_at
from people p
where me_id() is not null or auth.uid() is null;
    $sql$;
  end if;
end $view$;

-- Skipped once a later patch has widened it: replacing a view with a different
-- column order is refused outright, and running the patches out of order should
-- not be a trap.
do $tv$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'trainings_view' and column_name = 'grade'
  ) then
    execute $sql$
create or replace view trainings_view as
select t.*, coalesce(s.seq, 0) as seq
from trainings t
left join trainings_seq s on s.id = t.id
where me_id() is not null or auth.uid() is null;
    $sql$;
  end if;
end $tv$;

