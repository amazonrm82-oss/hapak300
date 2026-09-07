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
