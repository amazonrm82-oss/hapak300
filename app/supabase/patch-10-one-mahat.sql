-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 10 — מח״ט אחד, סמח״ט אחד, ובהזנה ידנית בלבד
--
--  להריץ אחרי 09. בטוח להרצה חוזרת.
--
--  בחטיבה יש מח״ט אחד וסמח״ט אחד. שני התפקידים אינם בחירה בטופס: מזין
--  אותם מנהל המערכת או מפקד החפ״ק, ביד, ואין שניים מאותו סוג.
--
--  אם כרגע יש אצלך יותר מאחד — הקובץ יעצור ויגיד מי הם, בלי לשנות כלום.
--  תחליט מי נשאר, ותריץ שוב.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── רק אחד מכל אחד ─────────────────────────────────────────────────────────
--
-- אינדקס ייחודי חלקי לכל תפקיד בנפרד. שני אינדקסים ולא אחד: אינדקס אחד על
-- שניהם היה מתיר רק שורה אחת בסך הכול.

do $$
declare dup text;
begin
  select string_agg(role || ': ' || cnt, ', ') into dup
    from (select role, count(*) as cnt from people
           where role in ('מח״ט', 'סמח״ט') group by role having count(*) > 1) x;
  if dup is not null then
    raise exception 'יש יותר מאחד — %. שנה תפקיד למי שאינו אמור להיות שם, והרץ שוב.', dup;
  end if;
end $$;

create unique index if not exists people_one_mahat  on people (role) where role = 'מח״ט';
create unique index if not exists people_one_smahat on people (role) where role = 'סמח״ט';


-- ── ומי רשאי לשבץ אותם ─────────────────────────────────────────────────────
--
-- אותה שמירה שכבר עומדת בשער המפקדה, מורחבת לתפקיד עצמו: מח״ט וסמח״ט הם
-- מבנה היחידה, ולא שדה שממלאים בטופס הצטרפות.

create or replace function guard_staff_seat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  boss boolean;
begin
  -- השרת פועל בשם עצמו במסלולי הכניסה, ואין לו טוקן
  if auth.uid() is null then return new; end if;

  boss := is_admin()
       or coalesce((select is_hapak_commander from people where auth_id = auth.uid()), false);

  -- התפקיד עצמו: מוזן ביד, ורק על ידי מי שאחראי למבנה
  if new.role in ('מח״ט', 'סמח״ט')
     and (tg_op = 'INSERT' or new.role is distinct from old.role)
     and not boss then
    raise exception 'רק מנהל מערכת או מפקד חפ״ק יכולים לשבץ מח״ט או סמח״ט';
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

  if not (new.is_admin or new.is_hapak_commander or new.role in ('מח״ט', 'סמח״ט')) then
    raise exception 'למפקדה משובצים מח״ט וסמח״ט בלבד, מעבר למנהל המערכת ומפקד החפ״ק';
  end if;

  return new;
end $$;

drop trigger if exists people_staff_guard on people;
create trigger people_staff_guard before insert or update on people
  for each row execute function guard_staff_seat();
