-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 13 — קצין אג״ם במפקדה, תקן אחד
--
--  להריץ אחרי 12. בטוח להרצה חוזרת.
--
--  קצין אג״ם עומד במפקדה לצד המח״ט והסמח״ט, ובאותם כללים בדיוק: אחד ולא
--  יותר, מוזן ביד על ידי מנהל המערכת או מפקד החפ״ק בלבד, ואינו בחירה בטופס
--  הצטרפות. כמו כל מי שבמפקדה הוא אינו שייך לצוות, ולכן מצרף את עצמו לכל
--  אימון שהוא מחליט להגיע אליו.
--
--  אם כרגע יש אצלך יותר מאחד — הקובץ יעצור ויגיד כמה, בלי לשנות כלום.
--  תחליט מי נשאר, ותריץ שוב.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── אחד ולא יותר ───────────────────────────────────────────────────────────

do $$
declare n integer;
begin
  select count(*) into n from people where role = 'קצין אג״ם';
  if n > 1 then
    raise exception 'יש % קציני אג״ם. שנה תפקיד למי שאינו אמור להיות שם, והרץ שוב.', n;
  end if;
end $$;

create unique index if not exists people_one_agam on people (role) where role = 'קצין אג״ם';


-- ── ומי רשאי לשבץ אותו ─────────────────────────────────────────────────────
--
-- אותה שמירה של עדכון 10, עם תפקיד שלישי ברשימה. שלושת התפקידים מוחזקים
-- כאן במקום אחד (`staff_roles`) כדי שהוספת תקן רביעי בעתיד תהיה שינוי של
-- שורה אחת ולא ציד אחרי מחרוזות בשלושה מקומות בפונקציה.

create or replace function guard_staff_seat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  boss        boolean;
  staff_roles text[] := array['מח״ט', 'סמח״ט', 'קצין אג״ם'];
begin
  -- השרת פועל בשם עצמו במסלולי הכניסה, ואין לו טוקן
  if auth.uid() is null then return new; end if;

  boss := is_admin()
       or coalesce((select is_hapak_commander from people where auth_id = auth.uid()), false);

  -- התפקיד עצמו: מוזן ביד, ורק על ידי מי שאחראי למבנה
  if new.role = any (staff_roles)
     and (tg_op = 'INSERT' or new.role is distinct from old.role)
     and not boss then
    raise exception 'רק מנהל מערכת או מפקד חפ״ק יכולים לשבץ מח״ט, סמח״ט או קצין אג״ם';
  end if;

  -- שייך לצוות? מכאן אין מה לבדוק.
  if new.team_id is not null then return new; end if;

  -- מי שכבר היה במפקדה ולא זז ממנה — לא נוגעים בו בעדכון של משהו אחר
  if tg_op = 'UPDATE' and old.team_id is null
     and new.role = old.role
     and new.is_admin = old.is_admin
     and new.is_hapak_commander = old.is_hapak_commander then
    return new;
  end if;

  if not boss then
    raise exception 'רק מנהל מערכת או מפקד חפ״ק יכולים לשבץ למפקדה';
  end if;

  if not (new.is_admin or new.is_hapak_commander or new.role = any (staff_roles)) then
    raise exception 'למפקדה משובצים מח״ט, סמח״ט וקצין אג״ם בלבד, מעבר למנהל המערכת ומפקד החפ״ק';
  end if;

  return new;
end $$;

drop trigger if exists people_staff_guard on people;
create trigger people_staff_guard before insert or update on people
  for each row execute function guard_staff_seat();
