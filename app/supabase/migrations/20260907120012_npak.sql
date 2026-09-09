-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 8 — נפ״ק: מי נוסע באיזה רכב
--
--  להריץ אחרי 07. בטוח להרצה חוזרת.
--
--  לכל אימון אפשר להוציא נפ״ק: רכב, נהג, ומי יושב בו — ולשלוח אותו
--  בוואטסאפ. מה שהוצא נשמר כפי שהיה, עם התאריך והשעה ומי הוציא אותו,
--  כי זה בדיוק מה שמחפשים אחר כך: מי נסע במה, ומתי.
--
--  השורות נשמרות כצילום ולא כהפניות: שם, מספר אישי ותפקיד כפי שהיו באותו
--  רגע. לוחם שיעבור צוות מחר לא ישנה נפ״ק שכבר יצא.
-- ═══════════════════════════════════════════════════════════════════════════


create table if not exists npak (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid references trainings (id) on delete set null,
  issued_at   timestamptz not null default now(),
  issued_by   uuid references people (id) on delete set null,
  rows        jsonb not null default '[]'::jsonb
);

comment on table npak is 'נפ״ק שהוצא: מי נוסע באיזה רכב, כפי שהיה באותו רגע';
comment on column npak.rows is
  '[{type, tz, seats, driver:{name,pn,role}, people:[{name,pn,role}]}]';

create index if not exists npak_training_idx on npak (training_id);
create index if not exists npak_issued_idx   on npak (issued_at desc);

alter table npak enable row level security;

-- הנפ״ק מלא מספרים אישיים, ולכן הוא נקרא ונכתב על ידי מי שרשאי לראות אותם:
-- מנהל מערכת, מפקד חפ״ק, מפקדי צוותים ומפקד האימון עצמו.
drop policy if exists npak_read on npak;
create policy npak_read on npak for select to authenticated
  using (is_admin() or is_team_cmd() or is_training_cmd(training_id));

drop policy if exists npak_write on npak;
create policy npak_write on npak for insert to authenticated
  with check (is_admin() or is_team_cmd() or is_training_cmd(training_id));

-- נפ״ק שיצא הוא רשומה היסטורית; מחיקה שמורה למנהל המערכת
drop policy if exists npak_delete on npak;
create policy npak_delete on npak for delete to authenticated
  using (is_admin());

grant select, insert on npak to authenticated;
grant delete on npak to authenticated;
