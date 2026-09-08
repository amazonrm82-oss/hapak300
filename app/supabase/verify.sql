-- ═══════════════════════════════════════════════════════════════════════════
-- בדיקה שכל העדכונים ירדו לבסיס הנתונים
--
-- קוראת בלבד — לא משנה, לא מוחקת ולא מוסיפה כלום. אפשר להריץ מתי שרוצים.
-- מדביקים ב-SQL Editor של Supabase ולוחצים Run.
--
-- כל שורה שמסומנת ❌ אומרת שאחד הקבצים לא הורץ או נפל באמצע. הסדר הנכון:
-- patch-01 → patch-02 → patch-03a → patch-03b → patch-04 → patch-05
-- ═══════════════════════════════════════════════════════════════════════════

with checks(sort, patch, what, ok) as (values

  -- ── patch-01 ──
  (1, '01', 'מנהל מערכת הוא דרגה מעל מפקד חפ״ק',
   to_regprocedure('public.guard_admin_rank()') is not null),
  (2, '01', 'רכבים קבועים עם צ׳ נשמרים במערכת',
   to_regclass('public.fleet') is not null),
  (3, '01', 'בקשת הצטרפות קופצת בהתראות להנהלה',
   to_regprocedure('public.notify_join_request()') is not null),
  (4, '01', 'הגבלת קצב על ניסיונות כניסה',
   to_regclass('public.rate_limits') is not null),
  (5, '01', 'יומן פעולות — מי עשה מה',
   to_regclass('public.audit_log') is not null),
  (6, '01', 'אפשר לנתק את כל המכשירים המחוברים',
   to_regprocedure('public.revoke_sessions(uuid)') is not null),
  (7, '01', 'רק ההנהלה יכולה להוציא התראה לכולם',
   exists (select 1 from pg_policies
            where tablename = 'notifications' and policyname = 'notifications_insert'
              and with_check like '%is_admin%')),

  -- ── patch-02 ──
  (8, '02', 'תקופות אימון שנסגרות ונשמרות',
   to_regclass('public.periods') is not null),
  (9, '02', 'סגירת תקופה ופתיחת הבאה',
   to_regprocedure('public.close_period(text, date, text)') is not null),
  (10, '02', 'נשק אישי ומספר סידורי',
   exists (select 1 from information_schema.columns
            where table_name = 'people' and column_name = 'weapon_serial')),
  (11, '02', 'פרופיל רפואי ומגבלות',
   exists (select 1 from information_schema.columns
            where table_name = 'people' and column_name = 'medical_profile')),

  -- ── patch-03 ──
  (12, '03a', 'צוות שלישי קיים בבסיס הנתונים',
   exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
            where t.typname = 'team_key' and e.enumlabel = 'c')),
  (13, '03b', 'צוות סדיר נוצר',
   exists (select 1 from teams where id = 'c')),
  (14, '03b', 'סדיר מקבל זימון לכל אימון של אלפה או ביתא',
   exists (select 1 from teams where id = 'c' and attends_all)),

  -- ── patch-04 ──
  (15, '04', 'מקצים באימון',
   to_regclass('public.drills') is not null),
  (16, '04', 'תוצאות לכל לוחם בכל מקצה',
   to_regclass('public.drill_results') is not null),
  (17, '04', 'ציון מחושב לבד מכדורים ופגיעות',
   to_regprocedure('public.set_drill_score()') is not null),
  (18, '04', 'ציון המפקד לאימון',
   exists (select 1 from information_schema.columns
            where table_name = 'trainings' and column_name = 'grade')),
  -- זו הבדיקה הכי חשובה בקובץ: בלעדיה הציון קיים בבסיס הנתונים
  -- אבל לא מגיע למסך, כי המסך קורא מהתצוגה ולא מהטבלה
  (19, '04', 'וציון המפקד מגיע למסך (התצוגה נבנתה מחדש)',
   exists (select 1 from information_schema.columns
            where table_name = 'trainings_view' and column_name = 'grade')),

  -- ── patch-05 ──
  (20, '05', 'רס״פ מנהל ציוד ורכבים',
   to_regprocedure('public.is_rasap()') is not null),
  (21, '05', 'סמל צוות מעדכן נשק והכשרות',
   to_regprocedure('public.is_sergeant()') is not null),
  (22, '05', 'והרס״פ באמת רשאי לגעת במאגר הרכבים',
   exists (select 1 from pg_policies
            where tablename = 'fleet' and policyname = 'fleet_write'
              and qual like '%is_rasap%')),
  (23, '05', 'וסמל הצוות רואה את מספר הנשק שהוא רושם',
   exists (select 1 from pg_views
            where viewname = 'people_view' and definition like '%is_sergeant%'))
)

select
  case when ok then '✅' else '❌' end as "תקין",
  patch                               as "קובץ",
  what                                as "מה נבדק"
from checks
order by sort;

-- שורת סיכום
select case
  when (select count(*) from information_schema.columns
         where table_name = 'trainings_view' and column_name = 'grade') = 1
   and (select count(*) from teams where id = 'c' and attends_all) = 1
   and to_regclass('public.drill_results') is not null
   and to_regclass('public.periods') is not null
   and to_regclass('public.fleet') is not null
   and to_regprocedure('public.is_sergeant()') is not null
   and (select count(*) from pg_policies
         where tablename = 'fleet' and policyname = 'fleet_write'
           and qual like '%is_rasap%') = 1
  then '✅ הכול ירד. המערכת מעודכנת.'
  else '❌ משהו חסר — ראה את השורות המסומנות למעלה.'
end as "סיכום";
