-- ═══════════════════════════════════════════════════════════════════════════
-- האם משהו מהעדכון של חפ״ק 300 נחת בפרויקט הזה בטעות?
--
-- קוראת בלבד. לא יוצרת, לא משנה ולא מוחקת כלום — אפשר להריץ בכל פרויקט,
-- כולל כזה שאין לו שום קשר למערכת.
--
-- מדביקים ב-SQL Editor ולוחצים Run. אם כל השורות מראות ״נקי״ — לא נשאר שם
-- שום דבר, ואין מה לעשות.
-- ═══════════════════════════════════════════════════════════════════════════

with objects(sort, kind, name, found) as (values
  (1, 'פונקציה', 'is_rasap',                to_regprocedure('public.is_rasap()') is not null),
  (2, 'פונקציה', 'is_sergeant',             to_regprocedure('public.is_sergeant()') is not null),
  (3, 'פונקציה', 'guard_vehicle_driver',    to_regprocedure('public.guard_vehicle_driver()') is not null),
  (4, 'פונקציה', 'guard_people_self_edit',  to_regprocedure('public.guard_people_self_edit()') is not null),
  (5, 'טבלה',   'training_guests',          to_regclass('public.training_guests') is not null),
  (6, 'טריגר',  'vehicles_driver_guard',
   exists (select 1 from pg_trigger where tgname = 'vehicles_driver_guard' and not tgisinternal)),
  (7, 'מדיניות', 'people_update (is_sergeant)',
   exists (select 1 from pg_policies
            where policyname = 'people_update' and qual like '%is_sergeant%')),
  (8, 'מדיניות', 'fleet_write (is_rasap)',
   exists (select 1 from pg_policies
            where policyname = 'fleet_write' and qual like '%is_rasap%')),
  (9, 'תצוגה',  'people_view (is_sergeant)',
   exists (select 1 from pg_views
            where viewname = 'people_view' and definition like '%is_sergeant%'))
)

select
  case when found then '⚠️ נמצא' else '✅ נקי' end as "מצב",
  kind                                            as "סוג",
  name                                            as "שם"
from objects
order by sort;

select case
  when to_regprocedure('public.is_rasap()') is not null
    or to_regprocedure('public.is_sergeant()') is not null
    or to_regprocedure('public.guard_vehicle_driver()') is not null
    or to_regclass('public.training_guests') is not null
    or exists (select 1 from pg_trigger
                where tgname = 'vehicles_driver_guard' and not tgisinternal)
  then '⚠️ משהו כן נחת כאן — הרץ את cleanup-other-project.sql'
  else '✅ הפרויקט נקי. שום דבר מהעדכון לא נכנס אליו.'
end as "סיכום";
