-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 9 — המפקדה היא תקן, לא מקום לחנות בו אנשים
--
--  להריץ אחרי 08. בטוח להרצה חוזרת.
--
--  במפקדה עומדים מח״ט וסמח״ט, ולצידם מי שמנהל את המערכת — מנהל המערכת
--  ומפקד החפ״ק — מתוקף תפקידם. כל אחד אחר שייך לצוות.
--
--  ומי שמשבץ למפקדה הוא מנהל המערכת או מפקד החפ״ק בלבד: זה שינוי במבנה
--  היחידה, לא שינוי פרטים.
-- ═══════════════════════════════════════════════════════════════════════════


create or replace function guard_staff_seat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- שייך לצוות? אין כאן מה לבדוק.
  if new.team_id is not null then return new; end if;

  -- השרת פועל בשם עצמו במסלולי הכניסה, ואין לו טוקן
  if auth.uid() is null then return new; end if;

  -- מי שכבר היה במפקדה ולא זז ממנה — לא נוגעים בו בעדכון של משהו אחר
  if tg_op = 'UPDATE' and old.team_id is null
     and new.role = old.role
     and new.is_admin = old.is_admin
     and new.is_hapak_commander = old.is_hapak_commander then
    return new;
  end if;

  if not (is_admin() or coalesce((select is_hapak_commander from people where auth_id = auth.uid()), false)) then
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
