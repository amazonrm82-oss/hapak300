-- ═══════════════════════════════════════════════════════════════════════════
-- The training period as a thing with a beginning and an end, the fighter
-- details a HQ party actually carries, and somewhere for a backup to land.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── what a fighter carries ─────────────────────────────────────────────────
--
-- Ammunition was planned by weapon type with no record of who holds which
-- weapon, so the allocation was an estimate rather than a count. The medical
-- profile and any limitation belong next to it: they decide what a fighter may
-- be assigned to, and until now they lived in somebody's head.

alter table people add column if not exists weapon          text not null default '';
alter table people add column if not exists weapon_serial   text not null default '';
alter table people add column if not exists medical_profile int;
alter table people add column if not exists limitations     text not null default '';

alter table people drop constraint if exists people_medical_profile_check;
alter table people add constraint people_medical_profile_check
  check (medical_profile is null or medical_profile between 21 and 97);

comment on column people.medical_profile is 'פרופיל רפואי 21–97, או ריק אם לא הוזן';
comment on column people.limitations is 'מגבלה רפואית או אחרת שמשפיעה על שיבוץ';

-- these are personal details, so they follow the same column-level grant as
-- the rest of the row (direct SELECT on `people` stays revoked)
grant select (weapon, weapon_serial, medical_profile, limitations) on people to authenticated;

-- ── the period ─────────────────────────────────────────────────────────────
--
-- `settings` holds the period running now. A period that ends should not be
-- overwritten by the next one: the whole point of a training period is what it
-- looked like when it finished.

create table if not exists periods (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  start_date date not null,
  end_date   date not null,
  closed_at  timestamptz not null default now(),
  closed_by  uuid references people (id) on delete set null,
  trainings  int not null default 0,
  summary    jsonb not null default '[]'::jsonb,
  note       text not null default ''
);

create index if not exists periods_closed_idx on periods (closed_at desc);

alter table periods enable row level security;

drop policy if exists periods_read on periods;
create policy periods_read on periods for select to authenticated using (me_id() is not null);

revoke all on periods from authenticated, anon;
grant select on periods to authenticated;

-- Closes the period that is running and opens the next one.
--
-- The summary is computed here, once, and kept: attendance out of the trainings
-- each fighter was rostered to, their commander's rating, and the certifications
-- that had expired by the closing date. Recomputing it later from live rows
-- would give a different answer every time people join and leave.
create or replace function close_period(new_name text, new_start date, note text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s          settings;
  pid        uuid;
  rows_json  jsonb;
  held       int;
begin
  if not is_admin() then
    raise exception 'סגירת תקופה שמורה למנהל המערכת ולמפקד החפ״ק';
  end if;
  if btrim(new_name) = '' then
    raise exception 'נדרש שם לתקופה החדשה';
  end if;

  select * into s from settings where id;
  if new_start <= s.period_start then
    raise exception 'תחילת התקופה החדשה חייבת להיות אחרי תחילת התקופה הנוכחית';
  end if;

  select count(*) into held
    from trainings t
   where t.date >= s.period_start and t.date < new_start and t.status <> 'cancelled';

  select coalesce(jsonb_agg(row), '[]'::jsonb) into rows_json from (
    select jsonb_build_object(
             'name',      p.rank || ' ' || p.name,
             'role',      p.role,
             'team',      coalesce(tm.name, 'מפקדה'),
             'rating',    p.rating,
             'assigned',  x.assigned,
             'attended',  x.attended,
             'absent',    x.absent,
             'expired',   x.expired
           ) as row
      from people p
      left join teams tm on tm.id = p.team_id
      cross join lateral (
        select
          count(*) filter (where true)                                as assigned,
          count(*) filter (where a.status in ('coming', 'late'))      as attended,
          count(*) filter (where a.status is null
                              or a.status not in ('coming', 'late'))  as absent,
          (select count(*) from jsonb_each_text(p.certs) c
            where c.value <> '' and c.value::date < new_start)        as expired
        from trainings t
        left join attendance a on a.training_id = t.id and a.person_id = p.id
        where t.date >= s.period_start and t.date < new_start
          and t.status <> 'cancelled'
          and p.team_id is not null
          and (t.team_id = 'joint' or t.team_id::text = p.team_id::text)
      ) x
     where p.status = 'active'
     order by tm.name nulls last, p.name
  ) q;

  insert into periods (name, start_date, end_date, closed_by, trainings, summary, note)
  values (s.period_name, s.period_start, new_start - 1, me_id(), held, rows_json, note)
  returning id into pid;

  update settings set period_name = btrim(new_name), period_start = new_start where id;

  perform notify(
    format('תקופת %s נסגרה (%s אימונים). נפתחה תקופת %s מ-%s.',
           s.period_name, held, btrim(new_name), new_start),
    array(select id from people where status = 'active'), null, 'general');

  return pid;
end $$;

grant execute on function close_period(text, date, text) to authenticated;

-- ── somewhere for a backup to land ─────────────────────────────────────────
-- Written by the scheduled job with the service key; read through a signed URL
-- that only an administrator can ask for.

insert into storage.buckets (id, name, public) values ('backups', 'backups', false)
on conflict (id) do nothing;

drop policy if exists "leadership reads backups" on storage.objects;
create policy "leadership reads backups" on storage.objects for select to authenticated
  using (bucket_id = 'backups' and is_admin());

-- ── the roster view, with what a fighter carries ───────────────────────────
--
-- `create or replace view` may only append columns, never reorder or rename
-- them, so the four new ones go on the end rather than beside the details they
-- belong with.
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
  -- a weapon serial is a controlled item number: its holder and commanders only
  case when can_see_pn() or p.id = me_id() then p.weapon_serial else '' end as weapon_serial,
  p.medical_profile,
  p.limitations
from people p
where me_id() is not null or auth.uid() is null;

-- ── the new fields are the commander's, like every other detail ────────────
--
-- Self-service stays limited to notification preferences. Without adding these
-- four to the comparison, a fighter could have edited their own medical profile
-- and weapon serial — the policy lets them write their own row, and this
-- trigger is what decides which columns that covers.
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
