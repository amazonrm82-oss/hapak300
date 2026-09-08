-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 5 — רס״פ וסמל צוות: תפקידים שנושאים הרשאה
--
--  להריץ אחרי patch-04. בטוח להריץ שוב ושוב.
--
--  אם תריץ שוב עדכון מוקדם יותר (01 או 02) — הרץ אחריו גם את זה. הם בונים
--  מחדש את אותה תצוגה, והאחרון שרץ הוא זה שקובע.
--
--  עד עכשיו כל הרשאה במערכת הגיעה מסימון — מפקד צוות, מפקד חפ״ק, מנהל מערכת —
--  והתפקיד היה תווית בלבד. שני תפקידים ביחידה כן נושאים סמכות:
--
--  · **רס״פ** — הציוד. מאגר הרכבים, הקטלוגים, והלוגיסטיקה של כל אימון: ציוד,
--    רכבים, תחמושת ומזון. לא מהלך היום ולא פרטי לוחמים.
--
--  · **סמל צוות** — הציוד האישי. נשק, מספר נשק והכשרות, בכרטיס של כל אחד —
--    ושום דבר אחר בו. הוא גם רואה את מספר הנשק, כי הוא זה שרושם אותו.
--
--  שניהם נאכפים כאן ולא רק במסכים, כדי שכפתור מוסתר לא יהיה הדבר היחיד שעומד
--  בין מישהו לבין עמודה שאסור לו לשנות.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function is_rasap() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'רס״פ' and status = 'active' from people where auth_id = auth.uid()), false)
$$;

create or replace function is_sergeant() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'סמל צוות' and status = 'active' from people where auth_id = auth.uid()), false)
$$;

grant execute on function is_rasap(), is_sergeant() to authenticated;

-- ── the רס״פ: equipment ────────────────────────────────────────────────────

drop policy if exists fleet_write on fleet;
create policy fleet_write on fleet for all to authenticated
  using (is_admin() or is_team_cmd() or is_rasap())
  with check (is_admin() or is_team_cmd() or is_rasap());

do $$
declare tbl text;
begin
  foreach tbl in array array['gear_catalog', 'vehicle_types', 'weapons', 'locations'] loop
    execute format('drop policy if exists %I_write on %I', tbl, tbl);
    execute format(
      'create policy %I_write on %I for all to authenticated '
      'using (is_admin() or is_team_cmd() or is_rasap()) '
      'with check (is_admin() or is_team_cmd() or is_rasap())',
      tbl, tbl);
  end loop;

  -- the logistics of a training, but not its day plan: the plan is the
  -- commander's, the kit that has to be there is the רס״פ's
  foreach tbl in array array['gear_items', 'vehicles', 'ammo', 'food'] loop
    execute format('drop policy if exists %I_write on %I', tbl, tbl);
    execute format(
      'create policy %I_write on %I for all to authenticated '
      'using (can_edit_training(training_id) or is_rasap()) '
      'with check (can_edit_training(training_id) or is_rasap())',
      tbl, tbl);
  end loop;
end $$;

-- ── the סמל צוות: personal kit ─────────────────────────────────────────────

drop policy if exists people_update on people;
create policy people_update on people for update to authenticated
  using (is_admin() or id = me_id() or is_sergeant())
  with check (is_admin() or id = me_id() or is_sergeant());

-- The policy decides which rows; this decides which columns. Both are needed:
-- without the trigger a סמל צוות reaching the row could rewrite anything on it.
create or replace function guard_people_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
-- Comparing the whole row against a list of what may differ means a column
-- added later is protected from the moment it exists, rather than from the
-- moment somebody remembers to add it here.
declare
  own text[] := array['notif', 'updated_at'];
  kit text[] := array['weapon', 'weapon_serial', 'certs', 'updated_at'];
begin
  -- no end-user JWT: the server acting for itself (the login routes write
  -- `pin_hash` and `auth_id` with the service key, which carries no token)
  if auth.uid() is null then return new; end if;
  if is_admin() then return new; end if;

  if new.id = me_id() then
    -- a סמל צוות keeps his own kit too, like everyone else's
    if is_sergeant() then own := own || kit; end if;
    if (to_jsonb(new) - own) is distinct from (to_jsonb(old) - own) then
      raise exception 'רק מנהל מערכת או מפקד החפ״ק יכולים לשנות פרטים, הרשאות והסמכות';
    end if;
    return new;
  end if;

  if is_sergeant() then
    if (to_jsonb(new) - kit) is distinct from (to_jsonb(old) - kit) then
      raise exception 'סמל צוות רשאי לעדכן נשק, מספר נשק והכשרות בלבד';
    end if;
    return new;
  end if;

  raise exception 'אין הרשאה לערוך לוחם אחר';
end $$;

-- A weapon serial is a controlled item number, masked from everyone but its
-- holder and the commanders. The סמל צוות is the one who writes it down, so he
-- has to be able to read it — without that also handing him personal numbers.
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
  case
    when can_see_pn() or p.id = me_id() or is_sergeant() then p.weapon_serial
    else ''
  end as weapon_serial,
  p.medical_profile,
  p.limitations
from people p
where me_id() is not null or auth.uid() is null;

grant select on people_view to authenticated;
