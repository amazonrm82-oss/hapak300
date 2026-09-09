-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 7 — כוונת אישית, לצד הנשק והאמר״ל
--
--  להריץ אחרי 06. בטוח להרצה חוזרת.
--
--  לכל לוחם נרשמת גם הכוונת שלו — סוג וצ׳ — והיא נכנסת לדו״ח הצל״ם באותה
--  שורה עם הנשק והאמר״ל. הצ׳ מוסתר כמו כל צ׳ אחר: רואים אותו בעליו,
--  המפקדים, וסמל הצוות — שהוא זה שרושם אותו.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── העמודות ────────────────────────────────────────────────────────────────

alter table people add column if not exists sight        text not null default '';
alter table people add column if not exists sight_serial text not null default '';

comment on column people.sight is 'סוג הכוונת האישית';
comment on column people.sight_serial is 'צ׳ של הכוונת';

grant select (sight, sight_serial) on people to authenticated;


-- ── סמל הצוות רושם גם אותה ─────────────────────────────────────────────────
--
-- מדיניות השורות קובעת על מי מותר לו; זה קובע אילו עמודות. בלי שתי העמודות
-- החדשות ברשימה הוא היה נחסם ברגע שירשום כוונת.

create or replace function guard_people_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  own      text[] := array['notif', 'updated_at'];
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


-- ── תצוגת הכרטיסים, מחדש ───────────────────────────────────────────────────
--
-- הצ׳ של הכוונת מוסתר כמו הצ׳ של הנשק והאמר״ל, ומאותה סיבה.

drop view if exists people_view;
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
  p.absent_from,
  p.absent_to,
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
  p.limitations,
  p.is_driver,
  p.nvg,
  case
    when can_see_pn() or p.id = me_id() or is_sergeant() then p.nvg_serial
    else ''
  end as nvg_serial,
  p.sight,
  case
    when can_see_pn() or p.id = me_id() or is_sergeant() then p.sight_serial
    else ''
  end as sight_serial
from people p
where me_id() is not null or auth.uid() is null;

grant select on people_view to authenticated;
