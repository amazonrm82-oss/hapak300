-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 12 — מי שבמפקדה מצטרף לאימון בעצמו
--
--  להריץ אחרי 11. בטוח להרצה חוזרת.
--
--  המפקדה אינה שייכת לצוות, ולכן אף אימון אינו "שלה" — ועד עכשיו זה אמר
--  שמי שעומד בה צריך שמישהו יצרף אותו. זה הפוך מהמציאות: מח״ט שמחליט
--  לבוא לאימון בא אליו.
--
--  מכאן: מי שאינו משובץ לצוות מצרף את עצמו לכל אימון, ומסיר את עצמו.
--  את מי שכן משובץ לצוות ממשיך לצרף מפקד צוות ומעלה, כמו קודם.
-- ═══════════════════════════════════════════════════════════════════════════


create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select team_id is null and status = 'active'
      from people where auth_id = auth.uid()), false)
$$;

grant execute on function is_staff() to authenticated;

drop policy if exists guests_write on training_guests;
create policy guests_write on training_guests for all to authenticated
  using (is_admin() or is_team_cmd() or (is_staff() and person_id = me_id()))
  with check (is_admin() or is_team_cmd() or (is_staff() and person_id = me_id()));
