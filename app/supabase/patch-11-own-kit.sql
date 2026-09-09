-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 11 — כל אחד מעדכן את הציוד של עצמו
--
--  להריץ אחרי 10. בטוח להרצה חוזרת.
--
--  הצ׳ים שלוחם חתום עליהם — נשק, אמר״ל וכוונת — הם שלו לתחזק. עד עכשיו רק
--  סמל צוות ומעלה יכלו לגעת בהם, וכל תיקון של ספרה עבר דרך מישהו אחר.
--
--  ההסמכות נשארות של המפקדים: תאריך תפוגה הוא לא משהו שכותב מי שהוא חל
--  עליו. וכל השאר — דרגה, תפקיד, צוות, הרשאות — כמו שהיה.
-- ═══════════════════════════════════════════════════════════════════════════


create or replace function guard_people_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  -- מה שכל אחד משנה בכרטיס של עצמו: ההעדפות, והצ׳ים שהוא חתום עליהם
  own      text[] := array['notif', 'updated_at',
                           'weapon', 'weapon_serial', 'nvg', 'nvg_serial',
                           'sight', 'sight_serial'];
  -- ומה שסמל הצוות משנה אצל אחרים, ובכרטיס שלו: אותם, ועוד ההסמכות
  kit      text[] := array['weapon', 'weapon_serial', 'nvg', 'nvg_serial',
                           'sight', 'sight_serial', 'certs', 'updated_at'];
  -- ארבעת המינויים, ועוד מה שאיש אינו עורך ביד
  no_touch text[] := array[
    'is_team_commander', 'is_instructor', 'is_hapak_commander', 'is_admin',
    'qual', 'auth_id', 'pin_hash', 'pin_set_at', 'sessions_valid_from'
  ];
  col text;
begin
  -- בלי JWT: השרת פועל בשם עצמו (מסלולי הכניסה כותבים pin_hash ו-auth_id
  -- עם מפתח השירות, שאין בו טוקן)
  if auth.uid() is null then return new; end if;
  if is_admin() then return new; end if;

  if new.id = me_id() and not is_team_cmd() then
    if is_sergeant() then own := own || kit; end if;
    if (to_jsonb(new) - own) is distinct from (to_jsonb(old) - own) then
      raise exception 'רק מנהל מערכת או מפקד החפ״ק יכולים לשנות פרטים, הרשאות והסמכות';
    end if;
    return new;
  end if;

  -- הכרטיס של מפקד הצוות הוא אחד מכרטיסי הצוות שלו
  if is_team_cmd()
     and (new.id = me_id() or old.team_id is not distinct from my_team()) then
    foreach col in array no_touch loop
      if to_jsonb(new)->col is distinct from to_jsonb(old)->col then
        raise exception 'מפקד צוות אינו ממנה מפקד צוות, מדריך, מפקד חפ״ק או מנהל מערכת';
      end if;
    end loop;
    return new;
  end if;

  if is_sergeant() then
    if (to_jsonb(new) - kit) is distinct from (to_jsonb(old) - kit) then
      raise exception 'סמל צוות רשאי לעדכן נשק, אמר״ל, כוונת והכשרות בלבד';
    end if;
    return new;
  end if;

  raise exception 'אין הרשאה לערוך לוחם אחר';
end $$;
