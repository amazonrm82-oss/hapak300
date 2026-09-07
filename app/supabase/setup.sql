-- ═══════════════════════════════════════════════════════════════════════════
--  כשירות חפ״ק מח״ט 300 — הקמת בסיס הנתונים
--
--  קובץ אחד להדבקה אחת: פתח בדשבורד של Supabase את SQL Editor → New query,
--  הדבק את כל התוכן של הקובץ הזה, ולחץ Run.
--
--  הכול רץ כטרנזקציה אחת — אם משהו נכשל, שום דבר לא נשמר וניתן לתקן ולהריץ
--  שוב. הרצה חוזרת אחרי הצלחה תיכשל על טבלאות שכבר קיימות; זה תקין ומכוון.
--
--  אחרי שזה עבר בהצלחה יש לך: כל הטבלאות, ההרשאות, הפונקציות, שני הצוותים,
--  עשרת נושאי האימון עם הוראות הבטיחות, המאגרים — ושני אנשים בלבד:
--    רס״ן מתן זזון   · 8409505 · מנהל מערכת
--    סרן  ישראל קדוש · 7387250 · מפקד החפ״ק
--
--  אין אימונים ואין נתוני דמו. את הלוחמים ואת הסבב מזינים מתוך המערכת.
--
--  (למפתחים: הקבצים ב-supabase/migrations/ הם אותו תוכן, מפוצל לפי מיגרציות,
--   לשימוש עם `supabase db push`. הקובץ הזה נוצר מהם על ידי build-setup.mjs.)
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  טבלאות
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- כשירות חפ״ק מח״ט 300 — schema
-- Mirrors the data model in the handoff README ("מודל נתונים").
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── enums ──────────────────────────────────────────────────────────────────
create type team_key as enum ('a', 'b');
create type training_team as enum ('a', 'b', 'joint');
create type person_status as enum ('active', 'inactive');
create type training_status as enum ('planned', 'published', 'done', 'cancelled');
create type invite_status as enum ('pending', 'accepted', 'declined');
create type att_status as enum ('coming', 'late', 'absent', 'sick', 'reserve', 'other');
create type vehicle_fitness as enum ('כשיר', 'טעון בדיקה', 'מושבת');
create type join_status as enum ('pending', 'approved', 'rejected');
create type calendar_source as enum ('manual', 'google');

-- ── updated_at trigger ─────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── settings (single row) ──────────────────────────────────────────────────
create table settings (
  id                      boolean primary key default true check (id),
  app_name                text    not null default 'כשירות חפ״ק מח״ט 300',
  unit_name               text    not null default 'חפ״ק מח״ט 300',
  brigade_commander       text    not null default '',
  period_start            date    not null,
  period_name             text    not null default 'חורף 2026',
  real_mode               boolean not null default true,
  allow_join              boolean not null default true,
  min_attendance          int     not null default 6,
  essential_roles         text[]  not null default array['חובש','נהג','מאבטח'],
  invite_hours            int     not null default 48,
  evening_reminder        text    not null default '18:00',
  morning_reminder_before int     not null default 120,
  approval_window_hours   int     not null default 48,
  cert_alert_days         int     not null default 30,
  summary_lock_days       int     not null default 7,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger settings_updated before update on settings
  for each row execute function set_updated_at();

-- ── teams ──────────────────────────────────────────────────────────────────
create table teams (
  id           team_key primary key,
  name         text not null,
  commander_id uuid,           -- FK added after people exists
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger teams_updated before update on teams
  for each row execute function set_updated_at();

-- ── people ─────────────────────────────────────────────────────────────────
-- `auth_id` links to the Supabase auth user created on first login.
-- `pin_hash` is a bcrypt/argon2 digest written only by the auth Edge Functions.
create table people (
  id                  uuid primary key default gen_random_uuid(),
  auth_id             uuid unique references auth.users (id) on delete set null,
  team_id             team_key references teams (id) on delete set null,
  rank                text not null,
  name                text not null,
  role                text not null,
  pn                  text not null unique check (pn ~ '^\d{7}$'),
  phone               text not null default '',
  status              person_status not null default 'active',
  status_note         text not null default '',
  rating              int  not null default 7 check (rating between 1 and 10),
  qual                text[] not null default '{}',
  is_team_commander   boolean not null default false,
  is_instructor       boolean not null default false,
  is_admin            boolean not null default false,
  is_hapak_commander  boolean not null default false,
  certs               jsonb not null default '{}'::jsonb,
  notif               jsonb not null default
                        '{"evening":true,"morning":true,"approved":true,"changed":true}'::jsonb,
  pin_hash            text,
  pin_set_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger people_updated before update on people
  for each row execute function set_updated_at();
create index people_team_idx on people (team_id);
create index people_auth_idx on people (auth_id);

alter table teams add constraint teams_commander_fk
  foreign key (commander_id) references people (id) on delete set null;

-- ── topics ─────────────────────────────────────────────────────────────────
create table topics (
  id         text primary key,
  name       text not null,
  safety     text not null default '',
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger topics_updated before update on topics
  for each row execute function set_updated_at();

-- ── catalogs ───────────────────────────────────────────────────────────────
create table gear_catalog   (name text primary key, sort int not null default 0);
create table vehicle_types  (name text primary key, sort int not null default 0);
create table weapons        (name text primary key, sort int not null default 0);
create table locations      (name text primary key, sort int not null default 0);

-- ── trainings ──────────────────────────────────────────────────────────────
create table trainings (
  id                 uuid primary key default gen_random_uuid(),
  team_id            training_team not null,
  topic_id           text not null references topics (id) on delete restrict,
  date               date not null,
  end_date           date,
  start_time         text not null check (start_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  end_time           text not null check (end_time   ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  location           text not null default '',
  coords             text not null default '',
  instructor_id      uuid references people (id) on delete set null,
  commander_id       uuid references people (id) on delete set null,
  inst_status        invite_status not null default 'pending',
  cmd_status         invite_status not null default 'pending',
  inst_invited_at    timestamptz,
  cmd_invited_at     timestamptz,
  status             training_status not null default 'planned',
  freq               text not null default 'רשת חפ״ק: ערוץ 3 · חלופי: ערוץ 7',
  safety             text not null default '',
  pickup             text not null default 'שער בסיס האם',
  departure          text not null default '05:30',
  medic_id           uuid references people (id) on delete set null,
  evac_vehicle_id    uuid,          -- FK added after vehicles exists
  order_file         jsonb,
  notes              text not null default '',
  trainer_summarized boolean not null default false,
  approved_all       boolean not null default false,
  ammo_signed        boolean not null default false,
  ammo_signed_by     uuid references people (id) on delete set null,
  ammo_signed_at     timestamptz,
  cancel_reason      text not null default '',
  summary            jsonb not null default
                       '{"commander":"","instructor":"","keep":"","improve":""}'::jsonb,
  approval_log       jsonb not null default '[]'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trainings_updated before update on trainings
  for each row execute function set_updated_at();
create index trainings_date_idx on trainings (date);
create index trainings_team_idx on trainings (team_id, date);

-- `seq` is derived, never stored: a running number by date within the team,
-- skipping cancelled trainings. A view keeps it correct after any edit.
create view trainings_seq as
select
  t.id,
  row_number() over (partition by t.team_id order by t.date, t.start_time, t.created_at)::int as seq
from trainings t
where t.status <> 'cancelled';

create view trainings_view as
select t.*, coalesce(s.seq, 0) as seq
from trainings t
left join trainings_seq s on s.id = t.id;

-- ── day blocks ─────────────────────────────────────────────────────────────
create table day_blocks (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  time        text not null,
  title       text not null,
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create index day_blocks_training_idx on day_blocks (training_id);

-- ── attendance ─────────────────────────────────────────────────────────────
create table attendance (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  person_id   uuid not null references people (id) on delete cascade,
  status      att_status not null,
  reason      text not null default '',
  marked_at   timestamptz not null default now(),
  approved    boolean not null default false,
  approved_by uuid references people (id) on delete set null,
  rating      int check (rating between 1 and 10),
  auto        boolean not null default false,
  unique (training_id, person_id)
);
create index attendance_training_idx on attendance (training_id);
create index attendance_person_idx on attendance (person_id);

-- ── logistics ──────────────────────────────────────────────────────────────
create table gear_items (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  name        text not null,
  qty         int  not null default 1,
  returned    boolean not null default false,
  missing     text not null default '',
  owner_id    uuid references people (id) on delete set null,
  sort        int not null default 0
);
create index gear_items_training_idx on gear_items (training_id);

create table vehicles (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  type        text not null,
  tz          text not null default '',
  driver_id   uuid references people (id) on delete set null,
  seats       int  not null default 4,
  departure   text not null default '05:30',
  fitness     vehicle_fitness not null default 'כשיר',
  fault       text not null default '',
  sort        int not null default 0
);
create index vehicles_training_idx on vehicles (training_id);

-- The unit's own vehicles, entered once with their צ׳ and picked from a list
-- afterwards. A training's `vehicles` row stays a copy rather than a reference:
-- the צ׳ that went out that day belongs in the record even if the vehicle is
-- later sold, renumbered or scrapped.
create table fleet (
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

alter table trainings add constraint trainings_evac_fk
  foreign key (evac_vehicle_id) references vehicles (id) on delete set null;

create table ammo (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  weapon      text not null,
  per_fighter int not null default 0,
  allocated   int not null default 0,
  used        int not null default 0,
  sort        int not null default 0
);
create index ammo_training_idx on ammo (training_id);

create table food (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  name        text not null,
  qty         int  not null default 0,
  unit        text not null default 'יח׳',
  note        text not null default '',
  sort        int not null default 0
);
create index food_training_idx on food (training_id);

-- ── chat, feedback, photos ─────────────────────────────────────────────────
create table chat_messages (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  author_id   uuid not null references people (id) on delete cascade,
  text        text not null default '',
  time        timestamptz not null default now(),
  pinned      boolean not null default false,
  read_by     uuid[] not null default '{}',
  attachment  jsonb
);
create index chat_messages_training_idx on chat_messages (training_id, time);

create table feedback (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  person_id   uuid not null references people (id) on delete cascade,
  overall     int not null check (overall between 1 and 5),
  instructor  int check (instructor between 1 and 5),
  logistics   int check (logistics between 1 and 5),
  comment     text not null default '',
  time        timestamptz not null default now(),
  unique (training_id, person_id)
);
create index feedback_training_idx on feedback (training_id);

create table photos (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  name        text not null,
  path        text,            -- object path in the training-photos bucket
  by_id       uuid references people (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index photos_training_idx on photos (training_id);

-- ── brigade calendar ───────────────────────────────────────────────────────
create table calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  date        date not null,
  time        text not null default '',
  all_day     boolean not null default false,
  location    text not null default '',
  training_id uuid references trainings (id) on delete set null,
  note        text not null default '',
  source      calendar_source not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger calendar_events_updated before update on calendar_events
  for each row execute function set_updated_at();
create index calendar_events_date_idx on calendar_events (date);

-- ── notifications ──────────────────────────────────────────────────────────
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  time        timestamptz not null default now(),
  "to"        uuid[],          -- null = everyone
  training_id uuid references trainings (id) on delete cascade,
  -- which reminder this is, so each person's preferences can be honoured
  kind        text not null default 'general',
  -- set once Web Push has gone out for this notification
  pushed_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_time_idx on notifications (time desc);
create index notifications_unpushed_idx on notifications (pushed_at) where pushed_at is null;

create table notification_reads (
  notification_id uuid not null references notifications (id) on delete cascade,
  person_id       uuid not null references people (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, person_id)
);

-- ── join requests ──────────────────────────────────────────────────────────
create table join_requests (
  id      uuid primary key default gen_random_uuid(),
  name    text not null,
  rank    text not null,
  role    text not null,
  pn      text not null,
  phone   text not null default '',
  team_id team_key not null default 'a',
  status  join_status not null default 'pending',
  at      timestamptz not null default now()
);

-- ── automations bookkeeping ────────────────────────────────────────────────
-- One row per reminder that has fired, so nothing is ever sent twice.
create table reminders_sent (
  key     text primary key,
  sent_at timestamptz not null default now()
);

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references people (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_person_idx on push_subscriptions (person_id);

-- ── realtime ───────────────────────────────────────────────────────────────
alter publication supabase_realtime add table trainings;
alter publication supabase_realtime add table attendance;
alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table gear_items;
alter publication supabase_realtime add table vehicles;
alter publication supabase_realtime add table ammo;
alter publication supabase_realtime add table food;
alter publication supabase_realtime add table calendar_events;
alter publication supabase_realtime add table people;
alter publication supabase_realtime add table day_blocks;
alter publication supabase_realtime add table feedback;
alter publication supabase_realtime add table photos;
alter publication supabase_realtime add table join_requests;
alter publication supabase_realtime add table fleet;


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  הרשאות (RLS) — מי רשאי לראות ולשנות מה
-- ╚══════════════════════════════════════════════════════════════════════╝

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

-- The system administrator alone. The two levels manage the same unit, but the
-- administrator outranks the HQ-party commander: only an administrator appoints
-- another administrator, or edits, demotes, removes one, or resets their code.
-- Without this the "levels" would differ in name only — a commander could reset
-- the administrator's code and walk into the account.
create or replace function is_sysadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from people where auth_id = auth.uid()), false)
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
alter table fleet              enable row level security;

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

create trigger people_self_edit_guard before update on people
  for each row execute function guard_people_self_edit();

-- The HQ-party commander manages the unit, but not the rank above them: they
-- may not appoint an administrator (themselves included), and may not touch an
-- administrator's row at all — no edit, no demotion, no removal, no code reset.
-- An administrator may do all of it, in both directions.
create or replace function guard_admin_rank() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- No end-user JWT means this is the server acting for itself — the login route
  -- stamping `auth_id` onto the administrator's own row, say. Ordinary sessions
  -- can never reach here without one: the policies grant writes to
  -- `authenticated` alone.
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

create trigger people_admin_rank_guard before insert or update or delete on people
  for each row execute function guard_admin_rank();

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

-- Writes still go to the table and are governed by the policies above. They
-- also need column-level SELECT: `update … where id = ?` reads `id` to find the
-- row, and without it Postgres refuses the statement outright — so an
-- administrator could add a fighter but never edit or remove one.
--
-- Everything readable through `people_view` anyway is granted here; the three
-- columns left out are the ones that must not be reachable by a hand-written
-- API call: `pn` (commanders only, and the view decides that per viewer),
-- `pin_hash`, and `auth_id`.
grant insert, update, delete on people to authenticated;
grant select (
  id, team_id, rank, name, role, phone, status, status_note, rating, qual,
  is_team_commander, is_instructor, is_admin, is_hapak_commander,
  certs, notif, pin_set_at, created_at, updated_at
) on people to authenticated;

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

-- ── the vehicle fleet ──────────────────────────────────────────────────────
-- Everyone picks from it; commanders maintain it, like the other catalogs.
create policy fleet_read on fleet for select to authenticated using (true);
create policy fleet_write on fleet for all to authenticated
  using (is_admin() or is_team_cmd()) with check (is_admin() or is_team_cmd());

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
-- Writing a notification is speaking with the unit's voice — it lands in
-- everyone's bell and, once push is on, on their lock screens. Only someone
-- who commands the thing being announced may do it: an administrator, a team
-- commander, or the commander or instructor of that particular training.
-- `me_id() is not null` used to be the last clause here, which made this true
-- for every logged-in fighter: anyone could have announced a cancellation to
-- the whole unit.
create policy notifications_insert on notifications for insert to authenticated
  with check (
    is_admin()
    or is_team_cmd()
    or (training_id is not null
        and (is_training_cmd(training_id) or is_training_instr(training_id)))
  );

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


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  פעולות מרובות-שורות (אישור נוכחות, יצירת סבב, דחייה, ביטול)
-- ╚══════════════════════════════════════════════════════════════════════╝

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

create trigger join_requests_notify after insert on join_requests
  for each row execute function notify_join_request();

-- The request comes from an anonymous caller, so the form is reachable by
-- anyone holding the public key. Without a ceiling, a script could bury the
-- leadership under thousands of requests — and now under thousands of pushes.
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

create trigger join_requests_guard before insert on join_requests
  for each row execute function guard_join_request();

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

  update join_requests set status = (case when accept then 'approved' else 'rejected' end)::join_status where id = jid;
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
  me_id(), is_admin(), is_team_cmd(), can_see_pn()
to authenticated;

-- `notify` is SECURITY DEFINER and writes straight into `notifications`,
-- bypassing the policy that decides who may announce something. It exists for
-- the other definer functions to call; nobody calls it from the browser.
revoke execute on function notify(text, uuid[], uuid, text) from authenticated, anon, public;


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  כניסה: איפוס קוד והגבלת ניסיונות
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- Login support: PIN reset, and throttling. A four-digit PIN is only 10,000
-- possibilities, so the rate limit — not the hash — is what actually protects
-- an account. The hash still matters if the database is ever copied.
-- ═══════════════════════════════════════════════════════════════════════════

create table login_attempts (
  pn         text primary key,
  failures   int not null default 0,
  locked_until timestamptz,
  last_try   timestamptz not null default now()
);
alter table login_attempts enable row level security;  -- service role only

-- A per-account lock stops someone guessing one fighter's code. It does not
-- stop someone walking the whole 7-digit space from one machine, learning which
-- numbers exist. This is the ceiling for that: counted per caller, not per
-- account, and written only by the server routes.
create table rate_limits (
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

-- Clearing the PIN sends the fighter back through "choose a code" on next login.
create or replace function reset_pin(pid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'איפוס קוד כניסה שמור למנהל המערכת ולמפקד החפ״ק';
  end if;
  -- resetting a code is a way into the account, so the rank order holds here too
  if not is_sysadmin() and (select is_admin from people where id = pid) then
    raise exception 'רק מנהל מערכת יכול לאפס את קוד הכניסה של מנהל מערכת';
  end if;
  update people set pin_hash = null, pin_set_at = null where id = pid;
  delete from login_attempts where pn = (select pn from people where id = pid);
end $$;

grant execute on function reset_pin(uuid) to authenticated;

-- Notification preferences are the one thing a fighter changes about themselves.
create or replace function set_my_notif(prefs jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update people set notif = prefs where id = me_id();
end $$;

grant execute on function set_my_notif(jsonb) to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  אוטומציות ותזכורות
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- Automations: the reminders the unit asked for, sent once each.
-- The cron job calls the `run-automations` Edge Function every 10 minutes.
-- ═══════════════════════════════════════════════════════════════════════════

-- `notifications.kind` and `notifications.pushed_at` are created in 0001; the
-- reminder bookkeeping tables are the service role's alone — no policy means no
-- access for ordinary sessions, which is the intent.

-- pg_cron and pg_net are enabled from the dashboard on hosted Supabase
-- (Database → Extensions). Enabling them from a migration needs privileges the
-- migration role does not always have, so a failure here is a notice, not a
-- broken deploy — the schedule in the comment below is set up separately anyway.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron לא הופעל מכאן — הפעל אותו מהדשבורד: Database → Extensions';
end $$;

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net לא הופעל מכאן — הפעל אותו מהדשבורד: Database → Extensions';
end $$;

-- ── הפעלת התזכורות ────────────────────────────────────────────────────────
--
-- פקודת התזמון עצמה אינה נמצאת בקובץ הזה בכוונה: היא מכילה ביטוי cron שבתוכו
-- רצף תווים שסוגר הערת SQL, ודי היה בכך כדי להפיל את כל הקובץ. את הפקודה
-- מריצים בנפרד ב-SQL Editor אחרי שהאתר פורסם — הנוסח המלא נמצא ב-README.md,
-- בסעיף "התזכורות".
--
-- לבדיקה:      select jobname, schedule, active from cron.job;
-- לעצירה:      select cron.unschedule('hapak-automations');
-- מה כבר נשלח: select * from reminders_sent order by sent_at desc limit 20;


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  נתוני פתיחה
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- Clean starting state: the unit's settings, both teams, the ten topics with
-- their safety templates, the catalogs — and exactly two people, the system
-- administrator and the HQ-party commander. No trainings, no demo data:
-- the roster and the rotation are entered in the app.
-- ═══════════════════════════════════════════════════════════════════════════

insert into settings (id, app_name, unit_name, brigade_commander, period_start, period_name,
                      real_mode, allow_join, min_attendance, essential_roles, invite_hours,
                      evening_reminder, morning_reminder_before, approval_window_hours,
                      cert_alert_days, summary_lock_days)
values (true, 'כשירות חפ״ק מח״ט 300', 'חפ״ק מח״ט 300', '', '2026-09-20', 'חורף 2026',
        true, true, 6, array['חובש','נהג','מאבטח'], 48, '18:00', 120, 48, 30, 7)
on conflict (id) do nothing;

insert into teams (id, name) values ('a', 'צוות א׳'), ('b', 'צוות ב׳')
on conflict (id) do nothing;

insert into topics (id, name, safety, sort) values
  ('setup', 'הקמת חפ״ק ופריסה',
   'עבודה בזוגות בהקמת האוהל · חיבור גנרטור רק על ידי בעל הסמכה · הארקה לפני הפעלת מסכים · מים בהישג יד בכל עמדה.', 1),
  ('comms', 'קשר ושו״ב',
   'אין שידור ללא אישור קצין הקשר · שמירת משמעת רשת · חובה קסדה בעבודה על תרנים · ניתוק מצברים בסיום.', 2),
  ('nav', 'ניווט וקריאת מפה',
   'ניווט בזוגות בלבד · דיווח נצ״ד כל 30 דקות · 3 ליטר מים ללוחם · חובש עם רכב פינוי בציר המרכזי.', 3),
  ('fire', 'ירי והכשרת נשק',
   'מנהלת מטווח: רס״ר גיא ניסים · נשק פרוק וטעון רק בעמדה · קו ירי אחד · ״הפסק אש״ מכל לוחם · חובש בעמדת הפיקוד.', 4),
  ('drive', 'נהיגה מבצעית',
   'חגורות בכל נסיעה · מהירות עד 40 קמ״ש בשטח · מפקד רכב בכל רכב · תדריך מסלול לפני יציאה.', 5),
  ('medic', 'עזרה ראשונה קרבית',
   'תרגול חוסם עורקים עד 30 שניות בלבד · אין מחטים אמיתיות · ערכת חובש אמיתית נפרדת מציוד התרגול.', 6),
  ('secure', 'אבטחת חפ״ק',
   'נשק ללא מחסנית בתרגול · תיאום גזרות ירי · הבחנה בין כוח מתרגל לכוח מאבטח (סרטים).', 7),
  ('night', 'ניוד חפ״ק בלילה',
   'נסיעה עם אמר״ל בלבד באישור · מרחק 50 מ׳ בין רכבים · חובה פנס אדום · דיווח הגעה בכל נקודת עצירה.', 8),
  ('fitness', 'כשירות גופנית',
   'שתייה לפני ואחרי · הפסקת פעילות מעל 32° · חובש נוכח · אין ריצה בכביש.', 9),
  ('hq', 'תרגיל מפקדות',
   'כל הוראות אימון ניוד ואבטחה חלות · מנוחה מינימלית 4 שעות · ניהול סיכונים של מפקד התרגיל לפני כל שלב.', 10)
on conflict (id) do nothing;

insert into gear_catalog (name, sort) values
  ('אפוד וקסדה', 1), ('מכשירי קשר', 2), ('אמר״ל / משקפי לילה', 3), ('מפות ומצפנים', 4),
  ('ערכת חובש', 5), ('אוהל חפ״ק ושולחנות', 6), ('גנרטור ותאורה', 7),
  ('מחשבים / מסכי שו״ב', 8), ('ציוד סימון משטח', 9)
on conflict (name) do nothing;

insert into vehicle_types (name, sort) values
  ('האמר', 1), ('רוביקון', 2), ('RZR', 3), ('זאב', 4), ('סופה', 5),
  ('נגמ״ש', 6), ('רכב קשר', 7), ('משאית', 8), ('אופנוע', 9), ('אמבולנס', 10)
on conflict (name) do nothing;

insert into weapons (name, sort) values
  ('M4 / תבור', 1), ('נגב', 2), ('מא״ג', 3), ('אקדח', 4), ('מטול רימונים', 5),
  ('רימוני רסס', 6), ('רימוני עשן', 7), ('סימונים / נורים', 8)
on conflict (name) do nothing;

-- The two people who can log in on day one. Everyone else is added from the
-- "צוותים" screen; nobody can sign in until they appear in this table.
insert into people (rank, name, role, pn, phone, team_id, rating, is_admin, is_hapak_commander)
values
  ('רס״ן', 'מתן זזון',   'מנהל מערכת',  '8409505', '052-5621437', null, 10, true,  false),
  ('סרן',  'ישראל קדוש', 'מפקד החפ״ק', '7387250', '058-5455567', null, 10, false, true)
on conflict (pn) do nothing;

-- ── storage ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('training-photos', 'training-photos', false),
  ('training-orders', 'training-orders', false),
  ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- Signed URLs only: any signed-in member of the unit may read and upload,
-- and remove what they uploaded themselves. Dropped first so this file can be
-- run again safely.
drop policy if exists "unit reads objects" on storage.objects;
drop policy if exists "unit uploads objects" on storage.objects;
drop policy if exists "owner removes objects" on storage.objects;

create policy "unit reads objects" on storage.objects for select to authenticated
  using (bucket_id in ('training-photos', 'training-orders', 'chat-attachments'));
create policy "unit uploads objects" on storage.objects for insert to authenticated
  with check (bucket_id in ('training-photos', 'training-orders', 'chat-attachments'));
create policy "owner removes objects" on storage.objects for delete to authenticated
  using (bucket_id in ('training-photos', 'training-orders', 'chat-attachments')
         and (owner = auth.uid() or is_admin()));
