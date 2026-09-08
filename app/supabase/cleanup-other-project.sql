-- ═══════════════════════════════════════════════════════════════════════════
-- הסרה של מה שנחת בטעות בפרויקט אחר
--
-- להריץ **רק** אם check-other-project.sql הראה ⚠️, ו**רק** בפרויקט הזר —
-- לא בפרויקט של חפ״ק 300.
--
-- מסירה אך ורק את מה שהעדכון של חפ״ק 300 יוצר, לפי שם מדויק. אם אחד מהם לא
-- קיים היא פשוט מדלגת עליו. שום דבר אחר בפרויקט לא נגע.
--
-- מה שהיא לא נוגעת בו בכוונה: guard_people_self_edit ו-people_view. אם קיימים
-- בפרויקט שלך אובייקטים בשמות האלה, סביר שהם שלך ולא שלי — מחיקה שלהם תשבור
-- לך משהו. אם הבדיקה סימנה אותם, תשלח לי צילום מסך ונטפל בזה נקודתית.
-- ═══════════════════════════════════════════════════════════════════════════

drop trigger if exists vehicles_driver_guard on public.vehicles;
drop function if exists public.guard_vehicle_driver();
drop table if exists public.training_guests;
drop function if exists public.is_rasap();
drop function if exists public.is_sergeant();

-- ומה נשאר
select case
  when to_regprocedure('public.is_rasap()') is null
   and to_regprocedure('public.is_sergeant()') is null
   and to_regprocedure('public.guard_vehicle_driver()') is null
   and to_regclass('public.training_guests') is null
  then '✅ הוסר. הפרויקט נקי.'
  else '⚠️ משהו נשאר — תשלח צילום מסך.'
end as "תוצאה";
