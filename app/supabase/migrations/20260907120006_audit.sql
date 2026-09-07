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

create table audit_log (
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

create index audit_log_at_idx on audit_log (at desc);

alter table audit_log enable row level security;

-- Readable by the leadership; written only by the trigger below, which is
-- SECURITY DEFINER. No insert, update or delete policy exists on purpose:
-- an entry nobody can alter afterwards is the whole point of a log.
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

create trigger people_audit    after insert or update or delete on people
  for each row execute function write_audit();
create trigger trainings_audit after insert or update or delete on trainings
  for each row execute function write_audit();
create trigger settings_audit  after update on settings
  for each row execute function write_audit();
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

create or replace view trainings_view as
select t.*, coalesce(s.seq, 0) as seq
from trainings t
left join trainings_seq s on s.id = t.id
where me_id() is not null or auth.uid() is null;
