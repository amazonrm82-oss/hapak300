-- ═══════════════════════════════════════════════════════════════════════════
-- Operations that touch several rows at once. Each one checks the same
-- permission the UI checks, then does its work in a single transaction.
-- ═══════════════════════════════════════════════════════════════════════════

-- Everyone rostered to the training's team (joint = both teams).
create or replace function training_participants(tid uuid)
returns setof people
language sql stable security definer set search_path = public as $$
  select p.* from people p, trainings t
  where t.id = tid and p.status = 'active' and p.team_id is not null
    and (t.team_id = 'joint' or p.team_id::text = t.team_id::text)
$$;

-- Raises a notification for a list of people (null = the whole unit).
create or replace function notify(
  body text, recipients uuid[], tid uuid default null, kind text default 'general')
returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  insert into notifications (text, "to", training_id, kind)
  values (body, recipients, tid, kind)
  returning id into nid;
  return nid;
end $$;

-- ── final attendance approval ──────────────────────────────────────────────
-- Anyone who never responded is recorded as 'absent' with `auto`, exactly as
-- the unit decided: "מי שלא הגיב נחשב לא מגיע".
create or replace function approve_attendance(tid uuid, pid uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare actor uuid := me_id(); n int := 0;
begin
  if not can_approve_training(tid) then
    raise exception 'אישור נוכחות סופי שמור למפקד הצוות, מפקד האימון המשותף או מנהל המערכת';
  end if;

  insert into attendance (training_id, person_id, status, reason, auto, marked_at)
  select tid, p.id, 'absent', 'לא הגיב — נחשב לא מגיע', true, now()
  from training_participants(tid) p
  where (pid is null or p.id = pid)
    and not exists (select 1 from attendance a where a.training_id = tid and a.person_id = p.id);

  update attendance a
     set approved = true, approved_by = actor
   where a.training_id = tid
     and (pid is null or a.person_id = pid)
     and a.person_id in (select id from training_participants(tid));
  get diagnostics n = row_count;

  update trainings
     set approved_all = (pid is null) or approved_all,
         approval_log = approval_log || jsonb_build_array(
           jsonb_build_object('by', actor, 'at', to_char(now(), 'YYYY-MM-DD HH24:MI'),
                              'scope', coalesce(pid::text, 'all')))
   where id = tid;

  perform notify(
    format('נוכחות %s ל%s אושרה על ידי %s.',
      case when pid is null then 'סופית'
           else 'של ' || (select rank || ' ' || name from people where id = pid) end,
      (select 'אימון ' || to_char(v.seq, 'FM00') from trainings_view v where v.id = tid),
      (select rank || ' ' || name from people where id = actor)),
    case when pid is null
      then array(select id from training_participants(tid)) || array[actor]
      else array[pid, actor] end,
    tid, 'approved');
end $$;

-- Re-opening drops the auto-marked rows entirely so the fighters mark again.
create or replace function reopen_attendance(tid uuid, pid uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_approve_training(tid) then
    raise exception 'פתיחת נוכחות מחדש שמורה למפקד';
  end if;
  delete from attendance where training_id = tid and (pid is null or person_id = pid) and auto;
  update attendance set approved = false, approved_by = null
   where training_id = tid and (pid is null or person_id = pid);
  update trainings set approved_all = false where id = tid;
end $$;

-- The training commander closes their tally; the team commander then approves.
create or replace function summarize_attendance(tid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare actor uuid := me_id(); team_cmd uuid;
begin
  if not (is_admin() or is_training_cmd(tid)) then
    raise exception 'סיכום הנוכחות שמור למפקד האימון';
  end if;
  update trainings set trainer_summarized = true where id = tid;
  select t.commander_id into team_cmd from teams t
   where t.id::text = (select team_id::text from trainings where id = tid);
  perform notify(
    format('מפקד האימון %s סיכם את הנוכחות — ממתין לאישור סופי של מפקד הצוות.',
           (select rank || ' ' || name from people where id = actor)),
    array_remove(array[team_cmd, actor], null), tid);
end $$;

-- The commander's 1–10 rating for a fighter at this training. Kept separate
-- from marking so rating someone can never overwrite the status they set.
create or replace function set_attendance_rating(tid uuid, pid uuid, score int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (can_approve_training(tid) or is_training_cmd(tid)) then
    raise exception 'דירוג אימון שמור למפקד';
  end if;
  if score is not null and (score < 1 or score > 10) then
    raise exception 'הדירוג חייב להיות בין 1 ל-10';
  end if;

  update attendance set rating = score where training_id = tid and person_id = pid;
  if not found then
    -- no mark yet: record the rating without asserting the fighter was there
    insert into attendance (training_id, person_id, status, reason, rating)
    values (tid, pid, 'absent', 'טרם סומנה נוכחות', score);
  end if;
end $$;

-- ── postpone / cancel / finish ─────────────────────────────────────────────
-- Postponing wipes the attendance: everyone marks again for the new date.
create or replace function postpone_training(
  tid uuid, new_date date, new_start text, new_end text)
returns void
language plpgsql security definer set search_path = public as $$
declare old_date date; dep text;
begin
  if not can_edit_training(tid) then raise exception 'אין הרשאה לדחות את האימון'; end if;
  select date into old_date from trainings where id = tid;

  dep := to_char(
    (new_start::time - interval '90 minutes')::time, 'HH24:MI');

  delete from attendance where training_id = tid;
  update trainings
     set date = new_date, start_time = new_start, end_time = new_end, departure = dep,
         approved_all = false, trainer_summarized = false, approval_log = '[]'::jsonb
   where id = tid;
  update vehicles set departure = dep where training_id = tid;

  perform notify(
    format('האימון נדחה מ-%s ל-%s. הנוכחות אופסה — נא לסמן מחדש.',
           to_char(old_date, 'DD.MM'), to_char(new_date, 'DD.MM')),
    array(select id from training_participants(tid)), tid, 'changed');
end $$;

-- Cancelling keeps the training in the archive with its reason.
create or replace function cancel_training(tid uuid, reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_edit_training(tid) then raise exception 'אין הרשאה לבטל את האימון'; end if;
  if coalesce(btrim(reason), '') = '' then raise exception 'נדרשת סיבת ביטול'; end if;
  update trainings set status = 'cancelled', cancel_reason = reason where id = tid;
  perform notify(format('האימון בוטל: %s', reason),
                 array(select id from training_participants(tid)), tid, 'changed');
end $$;

create or replace function finish_training(tid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or is_training_cmd(tid)) then
    raise exception 'סיום אימון שמור למפקד האימון';
  end if;
  update trainings set status = 'done' where id = tid;
  perform notify('האימון הסתיים והועבר לארכיון.',
                 array(select id from training_participants(tid)), tid);
end $$;

-- ── invitations ────────────────────────────────────────────────────────────
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
                         inst_status = case when self then 'accepted' else 'pending' end,
                         inst_invited_at = now()
     where id = tid;
  else
    update trainings set commander_id = pid,
                         cmd_status = case when self then 'accepted' else 'pending' end,
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

-- Accepting or declining is the invitee's own action.
create or replace function respond_invite(tid uuid, role text, accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare actor uuid := me_id(); ok boolean; leaders uuid[];
begin
  select case when role = 'instructor' then instructor_id = actor else commander_id = actor end
    into ok from trainings where id = tid;
  if not coalesce(ok, false) then raise exception 'ההזמנה אינה שלך'; end if;

  if role = 'instructor' then
    update trainings set inst_status = case when accept then 'accepted' else 'declined' end where id = tid;
  else
    update trainings set cmd_status  = case when accept then 'accepted' else 'declined' end where id = tid;
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

-- ── creating trainings (single or a whole rotation) ────────────────────────
-- Takes fully-formed drafts — the defaults are computed in the app so the
-- numbers stay in one place — and writes them with their logistics atomically.
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
      insert into vehicles (training_id, type, tz, driver_id, seats, departure, sort)
      values (tid, row_json->>'type', coalesce(row_json->>'tz',''),
              nullif(row_json->>'driver_id','')::uuid, (row_json->>'seats')::int,
              row_json->>'departure', i);
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

-- ── shift the whole schedule ───────────────────────────────────────────────
create or replace function shift_schedule(days int)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'הזזת הלו״ז שמורה למנהל המערכת ולמפקד החפ״ק'; end if;
  if days = 0 then return 0; end if;

  -- published trainings lose their marked attendance: the date moved
  delete from attendance where training_id in (
    select id from trainings where status = 'published');

  update trainings
     set date = date + days,
         end_date = case when end_date is null then null else end_date + days end,
         approved_all = false, trainer_summarized = false
   where status not in ('done', 'cancelled');
  get diagnostics n = row_count;

  update settings set period_start = period_start + days where id;

  if n > 0 then
    perform notify(
      format('לו״ז התקופה הוזז ב-%s ימים %s — %s אימונים עודכנו. נא לסמן נוכחות מחדש.',
             abs(days), case when days > 0 then 'קדימה' else 'אחורה' end, n),
      null, null, 'changed');
  end if;
  return n;
end $$;

-- ── chat read receipts ─────────────────────────────────────────────────────
create or replace function mark_chat_read(tid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare actor uuid := me_id();
begin
  if actor is null then return; end if;
  update chat_messages set read_by = array_append(read_by, actor)
   where training_id = tid and not (actor = any (read_by));
end $$;

create or replace function mark_notifications_read()
returns void
language plpgsql security definer set search_path = public as $$
declare actor uuid := me_id();
begin
  if actor is null then return; end if;
  insert into notification_reads (notification_id, person_id)
  select n.id, actor from notifications n
   where (n."to" is null or actor = any (n."to"))
  on conflict do nothing;
end $$;

-- ── approving a join request creates the person ────────────────────────────
create or replace function approve_join_request(jid uuid, accept boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare j join_requests; new_id uuid;
begin
  if not is_admin() then raise exception 'אישור בקשות הצטרפות שמור למנהל המערכת ולמפקד החפ״ק'; end if;
  select * into j from join_requests where id = jid;
  if not found then raise exception 'הבקשה לא נמצאה'; end if;

  update join_requests set status = case when accept then 'approved' else 'rejected' end where id = jid;
  if not accept then return null; end if;

  insert into people (team_id, rank, name, role, pn, phone, rating)
  values (j.team_id, j.rank, j.name, j.role, j.pn, j.phone, 7)
  returning id into new_id;
  return new_id;
end $$;

-- ── grants ─────────────────────────────────────────────────────────────────
grant execute on function
  approve_attendance(uuid, uuid), reopen_attendance(uuid, uuid), summarize_attendance(uuid),
  set_attendance_rating(uuid, uuid, int),
  postpone_training(uuid, date, text, text), cancel_training(uuid, text), finish_training(uuid),
  invite_person(uuid, text, uuid), respond_invite(uuid, text, boolean),
  create_trainings(jsonb, boolean), shift_schedule(int),
  mark_chat_read(uuid), mark_notifications_read(), approve_join_request(uuid, boolean),
  notify(text, uuid[], uuid, text),
  me_id(), is_admin(), is_team_cmd(), can_see_pn()
to authenticated;
