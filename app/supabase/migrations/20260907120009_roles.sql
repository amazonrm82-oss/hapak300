-- ═══════════════════════════════════════════════════════════════════════════
-- Two posts that carry rights of their own.
--
-- Until now every right in the system came from a permission checkbox — team
-- commander, HQ commander, administrator — and the `role` field was a label
-- with nothing behind it. Two of the unit's posts do carry authority, and it is
-- authority nobody else wants to exercise:
--
--   רס״פ       the equipment. The fleet, the catalogs, and the logistics of any
--              training: gear, vehicles, ammunition, food.
--   סמל צוות   the personal kit. Weapon, its serial and the certifications, on
--              anyone's card — and nothing else on it.
--
-- Both are enforced here as well as in the screens, so a hidden button is never
-- the only thing standing between someone and a column they may not change.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function is_rasap() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'רס״פ' and status = 'active' from people where auth_id = auth.uid()), false)
$$;

create or replace function is_sergeant() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'סמל צוות' and status = 'active' from people where auth_id = auth.uid()), false)
$$;

grant execute on function is_rasap(), is_sergeant() to authenticated;

-- ── the רס״פ: equipment ────────────────────────────────────────────────────

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

  -- the logistics of a training, but not its day plan: the plan is the
  -- commander's, the kit that has to be there is the רס״פ's
  foreach tbl in array array['gear_items', 'vehicles', 'ammo', 'food'] loop
    execute format('drop policy if exists %I_write on %I', tbl, tbl);
    execute format(
      'create policy %I_write on %I for all to authenticated '
      'using (can_edit_training(training_id) or is_rasap()) '
      'with check (can_edit_training(training_id) or is_rasap())',
      tbl, tbl);
  end loop;
end $$;

-- ── the סמל צוות: personal kit ─────────────────────────────────────────────

drop policy if exists people_update on people;
create policy people_update on people for update to authenticated
  using (is_admin() or id = me_id() or is_sergeant())
  with check (is_admin() or id = me_id() or is_sergeant());

-- The policy decides which rows; this decides which columns. Both are needed:
-- without the trigger a סמל צוות reaching the row could rewrite anything on it.
create or replace function guard_people_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
-- Comparing the whole row against a list of what may differ means a column
-- added later is protected from the moment it exists, rather than from the
-- moment somebody remembers to add it here.
declare
  own text[] := array['notif', 'updated_at'];
  kit text[] := array['weapon', 'weapon_serial', 'certs', 'updated_at'];
begin
  -- no end-user JWT: the server acting for itself (the login routes write
  -- `pin_hash` and `auth_id` with the service key, which carries no token)
  if auth.uid() is null then return new; end if;
  if is_admin() then return new; end if;

  if new.id = me_id() then
    -- a סמל צוות keeps his own kit too, like everyone else's
    if is_sergeant() then own := own || kit; end if;
    if (to_jsonb(new) - own) is distinct from (to_jsonb(old) - own) then
      raise exception 'רק מנהל מערכת או מפקד החפ״ק יכולים לשנות פרטים, הרשאות והסמכות';
    end if;
    return new;
  end if;

  if is_sergeant() then
    if (to_jsonb(new) - kit) is distinct from (to_jsonb(old) - kit) then
      raise exception 'סמל צוות רשאי לעדכן נשק, מספר נשק והכשרות בלבד';
    end if;
    return new;
  end if;

  raise exception 'אין הרשאה לערוך לוחם אחר';
end $$;

-- A weapon serial is a controlled item number, masked from everyone but its
-- holder and the commanders. The סמל צוות is the one who writes it down, so he
-- has to be able to read it — without that also handing him personal numbers.
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
  p.limitations
from people p
where me_id() is not null or auth.uid() is null;

grant select on people_view to authenticated;

-- ── a driver needs a licence in date ───────────────────────────────────────
--
-- Checked against the day of the training, not the day someone edits the row:
-- a licence that expires the week before is not a licence on the morning the
-- convoy leaves. This is the one certification that blocks rather than warns.

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

-- ── הגעה, ציון, והשלמה ─────────────────────────────────────────────────────
--
-- Two facts the system kept apart until now: who was at a training, and who
-- was scored in it. A fighter who did not show up was simply missing from the
-- scores, which reads as "not measured" rather than "did not train" — and the
-- team average quietly improved every time somebody stayed home.
--
-- From here on, the roster of a training is the people marked present or late.
-- Whoever was rostered and did not attend is scored 0 — but only once the
-- training is closed, so that a training still ahead shows nobody a zero it has
-- not earned yet. And a fighter can make it up: a team commander (and above)
-- puts him into another team's training, and that training stands in for the
-- one he missed.

create table if not exists training_guests (
  training_id uuid not null references trainings (id) on delete cascade,
  person_id   uuid not null references people (id) on delete cascade,
  -- the training this makes up for; null when the fighter is simply attached
  -- to another team's training for the day
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

-- Attaching someone to another team's training is a commander's call: it moves
-- a fighter between forces for a day and decides whether a missed training is
-- made good. A fighter cannot arrange his own makeup.
drop policy if exists guests_write on training_guests;
create policy guests_write on training_guests for all to authenticated
  using (is_admin() or is_team_cmd())
  with check (is_admin() or is_team_cmd());

revoke all on training_guests from authenticated, anon;
grant select, insert, update, delete on training_guests to authenticated;

-- guests count as participants: for the roster, the food, the seats and the
-- policies that decide who may see and mark attendance
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
