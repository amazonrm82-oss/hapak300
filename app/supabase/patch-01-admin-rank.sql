-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 1 — סדר דרגות, תיקון ההזמנות, וצי הרכבים
--
--  להדבקה ב-SQL Editor של Supabase (New query → Paste → Run) על בסיס נתונים
--  שכבר הוקם. בטוח להריץ שוב ושוב, ולא נוגע בשום נתון קיים.
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
begin
  -- No end-user JWT means the server is acting for itself: the login routes
  -- write `pin_hash` and `auth_id` with the service key, which carries no
  -- token. Without this exemption a fighter's chosen code was silently
  -- rejected and they were asked to choose one again on every single login.
  -- Ordinary sessions cannot reach here without a token — writes to `people`
  -- are granted to `authenticated` alone.
  if auth.uid() is null then return new; end if;
  if is_admin() then return new; end if;
  if new.id <> me_id() then
    raise exception 'אין הרשאה לערוך לוחם אחר';
  end if;
  -- self-service is limited to notification preferences
  if (new.rank, new.name, new.role, new.pn, new.phone, new.team_id, new.status,
      new.rating, new.qual, new.is_team_commander, new.is_instructor,
      new.is_admin, new.is_hapak_commander, new.certs, new.pin_hash)
     is distinct from
     (old.rank, old.name, old.role, old.pn, old.phone, old.team_id, old.status,
      old.rating, old.qual, old.is_team_commander, old.is_instructor,
      old.is_admin, old.is_hapak_commander, old.certs, old.pin_hash)
  then
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
