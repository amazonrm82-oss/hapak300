-- ═══════════════════════════════════════════════════════════════════════════
-- Row level security — the permission matrix from the handoff README, enforced
-- in the database. The UI hides what a person may not do; this is what stops
-- them doing it anyway through the API.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── identity helpers ───────────────────────────────────────────────────────
-- SECURITY DEFINER so policies on `people` can call them without recursing.

create or replace function me_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from people where auth_id = auth.uid()
$$;

create or replace function me() returns people
language sql stable security definer set search_path = public as $$
  select * from people where auth_id = auth.uid()
$$;

-- system administrator or HQ-party commander — full management rights
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or is_hapak_commander from people where auth_id = auth.uid()), false)
$$;

create or replace function is_team_cmd() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_team_commander from people where auth_id = auth.uid()), false)
$$;

create or replace function is_instructor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_instructor from people where auth_id = auth.uid()), false)
$$;

create or replace function my_team() returns team_key
language sql stable security definer set search_path = public as $$
  select team_id from people where auth_id = auth.uid()
$$;

-- personal numbers are visible to commanders only
create or replace function can_see_pn() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_team_cmd()
$$;

-- ── per-training helpers ───────────────────────────────────────────────────

create or replace function is_training_cmd(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainings t where t.id = tid and t.commander_id = me_id())
$$;

create or replace function is_training_instr(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainings t where t.id = tid and t.instructor_id = me_id())
$$;

-- a team commander owns their own team's trainings and every joint training
create or replace function is_team_cmd_of(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_team_cmd() and exists (
    select 1 from trainings t
    where t.id = tid and (t.team_id::text = my_team()::text or t.team_id = 'joint')
  )
$$;

-- edit the training itself, its logistics, ammunition and day plan
create or replace function can_edit_training(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_team_cmd_of(tid) or is_training_cmd(tid) or is_training_instr(tid)
$$;

-- final attendance approval and re-opening
create or replace function can_approve_training(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (
    case when (select team_id from trainings where id = tid) = 'joint'
      then is_training_cmd(tid)
      else is_team_cmd_of(tid)
    end
  )
$$;

-- see the full attendance list and the statistics
create or replace function sees_list(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_team_cmd() or is_training_cmd(tid) or is_training_instr(tid)
$$;

-- taking part in the training: rostered to the team, or its instructor/commander
create or replace function is_participant(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trainings t
    where t.id = tid
      and (t.team_id = 'joint' or t.team_id::text = my_team()::text
           or t.instructor_id = me_id() or t.commander_id = me_id())
  )
$$;

-- ── enable RLS everywhere ──────────────────────────────────────────────────
alter table settings           enable row level security;
alter table teams              enable row level security;
alter table people             enable row level security;
alter table topics             enable row level security;
alter table gear_catalog       enable row level security;
alter table vehicle_types      enable row level security;
alter table weapons            enable row level security;
alter table locations          enable row level security;
alter table trainings          enable row level security;
alter table day_blocks         enable row level security;
alter table attendance         enable row level security;
alter table gear_items         enable row level security;
alter table vehicles           enable row level security;
alter table ammo               enable row level security;
alter table food               enable row level security;
alter table chat_messages      enable row level security;
alter table feedback           enable row level security;
alter table photos             enable row level security;
alter table calendar_events    enable row level security;
alter table notifications      enable row level security;
alter table notification_reads enable row level security;
alter table join_requests      enable row level security;
alter table reminders_sent     enable row level security;
alter table push_subscriptions enable row level security;

-- ── settings ───────────────────────────────────────────────────────────────
create policy settings_read on settings for select to authenticated using (true);
create policy settings_write on settings for update to authenticated
  using (is_admin()) with check (is_admin());

-- ── teams ──────────────────────────────────────────────────────────────────
create policy teams_read on teams for select to authenticated using (true);
create policy teams_write on teams for update to authenticated
  using (is_admin()) with check (is_admin());

-- ── people ─────────────────────────────────────────────────────────────────
-- Everyone sees the roster (phones are shared by design); only administrators
-- and the HQ-party commander may add, edit or remove anyone. `pn` and
-- `pin_hash` are filtered by the view below, not by these policies.
create policy people_read on people for select to authenticated using (true);
create policy people_insert on people for insert to authenticated with check (is_admin());
create policy people_update on people for update to authenticated
  using (is_admin() or id = me_id()) with check (is_admin() or id = me_id());
create policy people_delete on people for delete to authenticated using (is_admin());

-- A fighter may edit only their own notification preferences; everything else
-- on their own row is the administrator's to change.
create or replace function guard_people_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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

create trigger people_self_edit_guard before update on people
  for each row execute function guard_people_self_edit();

-- The last administrator cannot be demoted or deleted — otherwise nobody can
-- ever manage the system again.
create or replace function guard_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare remaining int;
begin
  select count(*) into remaining from people
   where (is_admin or is_hapak_commander)
     and id <> coalesce(new.id, old.id);
  if remaining = 0 and (tg_op = 'DELETE' or not (new.is_admin or new.is_hapak_commander)) then
    raise exception 'לא ניתן להסיר את ההרשאה של מנהל המערכת האחרון';
  end if;
  return coalesce(new, old);
end $$;

create trigger people_last_admin_guard before update or delete on people
  for each row execute function guard_last_admin();

-- The roster as the client reads it: no pin hash ever, and the personal number
-- only for commanders.
--
-- Direct SELECT on `people` is revoked below — that revocation is what actually
-- hides `pn` and `pin_hash` from a fighter calling the API by hand. The view
-- therefore runs as its owner (Postgres's default for views) and does the
-- masking itself; reading the roster is open to the whole unit either way, so
-- nothing is widened by bypassing the table's `using (true)` read policy.
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
  p.updated_at
from people p;

revoke select on people from authenticated, anon;
grant select on people_view to authenticated;
grant select on trainings_view to authenticated;
-- writes still go to the table, and are governed by the policies above
grant insert, update, delete on people to authenticated;

-- ── topics and catalogs ────────────────────────────────────────────────────
create policy topics_read on topics for select to authenticated using (true);
create policy topics_write on topics for all to authenticated
  using (is_admin()) with check (is_admin());

do $$
declare tbl text;
begin
  foreach tbl in array array['gear_catalog', 'vehicle_types', 'weapons', 'locations'] loop
    execute format('create policy %I_read on %I for select to authenticated using (true)', tbl, tbl);
    -- team commanders maintain the catalogs alongside the administrators
    execute format(
      'create policy %I_write on %I for all to authenticated using (is_admin() or is_team_cmd()) with check (is_admin() or is_team_cmd())',
      tbl, tbl);
  end loop;
end $$;

-- ── trainings ──────────────────────────────────────────────────────────────
create policy trainings_read on trainings for select to authenticated using (true);
create policy trainings_insert on trainings for insert to authenticated
  with check (is_admin() or is_team_cmd());
create policy trainings_update on trainings for update to authenticated
  using (can_edit_training(id)) with check (can_edit_training(id));
-- permanent deletion is the administrator's alone; cancelling keeps the record
create policy trainings_delete on trainings for delete to authenticated using (is_admin());

-- Dates, times and the roster's team are the period manager's to change; an
-- instructor may edit the content of their own training but not move it.
create or replace function guard_training_period_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_admin() then return new; end if;
  if (new.date, new.end_date, new.team_id) is distinct from (old.date, old.end_date, old.team_id)
     and not (is_team_cmd_of(new.id) or is_training_cmd(new.id)) then
    raise exception 'שינוי תאריך או צוות שמור למנהל המערכת, מפקד החפ״ק ומפקדי האימון';
  end if;
  return new;
end $$;

create trigger trainings_period_guard before update on trainings
  for each row execute function guard_training_period_fields();

-- ── training children (day plan, logistics) ────────────────────────────────
do $$
declare tbl text;
begin
  foreach tbl in array array['day_blocks', 'gear_items', 'vehicles', 'ammo', 'food'] loop
    execute format('create policy %I_read on %I for select to authenticated using (true)', tbl, tbl);
    execute format(
      'create policy %I_write on %I for all to authenticated using (can_edit_training(training_id)) with check (can_edit_training(training_id))',
      tbl, tbl);
  end loop;
end $$;

-- ── attendance ─────────────────────────────────────────────────────────────
-- A fighter sees only their own row unless they are entitled to the full list.
create policy attendance_read on attendance for select to authenticated
  using (person_id = me_id() or sees_list(training_id));

create policy attendance_insert on attendance for insert to authenticated
  with check (
    (person_id = me_id() and is_participant(training_id))
    or can_approve_training(training_id)
    or is_training_cmd(training_id)
  );

create policy attendance_update on attendance for update to authenticated
  using (
    (person_id = me_id() and is_participant(training_id))
    or can_approve_training(training_id)
    or is_training_cmd(training_id)
  )
  with check (
    (person_id = me_id() and is_participant(training_id))
    or can_approve_training(training_id)
    or is_training_cmd(training_id)
  );

create policy attendance_delete on attendance for delete to authenticated
  using (can_approve_training(training_id));

-- Marking closes when the training starts; approval and the 1–10 rating are the
-- commander's, never the fighter's.
create or replace function guard_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
declare t trainings; approver boolean;
begin
  select * into t from trainings where id = new.training_id;
  approver := can_approve_training(new.training_id) or is_training_cmd(new.training_id);

  if not approver then
    if t.status in ('done', 'cancelled') then
      raise exception 'האימון נסגר — לא ניתן לעדכן נוכחות';
    end if;
    if (now() at time zone 'Asia/Jerusalem')::date > t.date then
      raise exception 'חלון סימון הנוכחות נסגר בתחילת האימון';
    end if;
    if new.approved or new.approved_by is not null or new.auto then
      raise exception 'אישור נוכחות שמור למפקד';
    end if;
    if new.rating is distinct from (case when tg_op = 'UPDATE' then old.rating else null end) then
      raise exception 'דירוג אימון שמור למפקד';
    end if;
    if tg_op = 'UPDATE' and old.approved then
      raise exception 'הנוכחות אושרה — רק מפקד יכול לפתוח אותה מחדש';
    end if;
  end if;

  -- a reason is mandatory for anything other than "coming" or "late"
  if new.status not in ('coming', 'late') and coalesce(btrim(new.reason), '') = '' then
    raise exception 'חובה לציין סיבה כשלא מגיעים';
  end if;
  return new;
end $$;

create trigger attendance_guard before insert or update on attendance
  for each row execute function guard_attendance();

-- ── chat ───────────────────────────────────────────────────────────────────
create policy chat_read on chat_messages for select to authenticated
  using (is_participant(training_id) or is_admin());
create policy chat_insert on chat_messages for insert to authenticated
  with check (author_id = me_id() and (is_participant(training_id) or is_admin()));
-- authors mark messages read; only commanders pin
create policy chat_update on chat_messages for update to authenticated
  using (is_participant(training_id) or is_admin())
  with check (is_participant(training_id) or is_admin());
create policy chat_delete on chat_messages for delete to authenticated
  using (author_id = me_id() or is_admin());

create or replace function guard_chat_pin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pinned is distinct from old.pinned
     and not (is_admin() or is_team_cmd_of(new.training_id) or is_training_cmd(new.training_id)) then
    raise exception 'נעיצת הודעה שמורה למפקדים';
  end if;
  if (new.text, new.attachment, new.author_id) is distinct from (old.text, old.attachment, old.author_id)
     and new.author_id <> me_id() and not is_admin() then
    raise exception 'לא ניתן לערוך הודעה של לוחם אחר';
  end if;
  return new;
end $$;

create trigger chat_pin_guard before update on chat_messages
  for each row execute function guard_chat_pin();

-- ── feedback ───────────────────────────────────────────────────────────────
-- Fighters write their own; commanders and the instructor read all of it.
create policy feedback_read on feedback for select to authenticated
  using (person_id = me_id() or is_admin() or is_team_cmd_of(training_id)
         or is_training_cmd(training_id) or is_training_instr(training_id));
create policy feedback_write on feedback for all to authenticated
  using (person_id = me_id()) with check (person_id = me_id() and is_participant(training_id));

-- ── photos ─────────────────────────────────────────────────────────────────
create policy photos_read on photos for select to authenticated
  using (is_participant(training_id) or is_admin());
create policy photos_insert on photos for insert to authenticated
  with check (is_participant(training_id) or is_admin());
create policy photos_delete on photos for delete to authenticated
  using (by_id = me_id() or can_edit_training(training_id));

-- ── brigade calendar ───────────────────────────────────────────────────────
create policy calendar_read on calendar_events for select to authenticated using (true);
create policy calendar_write on calendar_events for all to authenticated
  using (is_admin()) with check (is_admin());

-- ── notifications ──────────────────────────────────────────────────────────
create policy notifications_read on notifications for select to authenticated
  using ("to" is null or me_id() = any ("to"));
-- anyone whose actions notify others (commanders, instructors) may write one
create policy notifications_insert on notifications for insert to authenticated
  with check (is_admin() or is_team_cmd() or is_instructor() or me_id() is not null);

create policy reads_read on notification_reads for select to authenticated
  using (person_id = me_id());
create policy reads_write on notification_reads for all to authenticated
  using (person_id = me_id()) with check (person_id = me_id());

-- ── join requests ──────────────────────────────────────────────────────────
-- Submitted from the login screen, before there is any session at all — so the
-- switch is read through a definer function rather than from `settings`, which
-- an anonymous caller may not select.
create or replace function join_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select allow_join from settings where id), false)
$$;
grant execute on function join_allowed() to anon, authenticated;

create policy join_insert_anon on join_requests for insert to anon
  with check (join_allowed() and status = 'pending');
create policy join_insert_auth on join_requests for insert to authenticated
  with check (join_allowed() and status = 'pending');
create policy join_read on join_requests for select to authenticated using (is_admin());
create policy join_write on join_requests for update to authenticated
  using (is_admin()) with check (is_admin());
create policy join_delete on join_requests for delete to authenticated using (is_admin());

-- ── automations ────────────────────────────────────────────────────────────
-- reminders_sent is written only by the cron job (service role); no policy for
-- authenticated means no access, which is the intent.
create policy push_own on push_subscriptions for all to authenticated
  using (person_id = me_id()) with check (person_id = me_id());
