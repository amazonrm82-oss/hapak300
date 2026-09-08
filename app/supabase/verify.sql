-- ═══════════════════════════════════════════════════════════════════════════
-- בדיקה שכל העדכונים ירדו לבסיס הנתונים
--
-- קוראת בלבד — לא משנה, לא מוחקת ולא מוסיפה כלום. אפשר להריץ מתי שרוצים.
-- מדביקים ב-SQL Editor של Supabase ולוחצים Run.
--
-- כל שם טבלה כאן מלא (public.teams ולא teams): עורך ה-SQL מריץ שאילתות קריאה
-- בלי public בנתיב החיפוש, ובלי הקידומת הוא לא מוצא את הטבלאות.
--
-- כל שורה שמסומנת ❌ אומרת שאחד הקבצים לא הורץ או נפל באמצע. הסדר הנכון:
-- patch-01 → patch-02 → patch-03a → patch-03b → patch-04 → patch-05 → patch-05b
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
   exists (select 1 from public.teams where id = 'c')),
  (14, '03b', 'סדיר מקבל זימון לכל אימון של אלפה או ביתא',
   exists (select 1 from public.teams where id = 'c' and attends_all)),

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
            where viewname = 'people_view' and definition like '%is_sergeant%')),
  (24, '05', 'נהג חייב רישיון נהיגה בתוקף',
   exists (select 1 from pg_trigger
            where tgname = 'vehicles_driver_guard' and not tgisinternal)),
  (25, '05', 'השלמות ושיבוץ לאימון של צוות אחר',
   to_regclass('public.training_guests') is not null),
  (26, '05', 'מפקד צוות עורך את הצוות שלו',
   exists (select 1 from pg_policies
            where tablename = 'people' and policyname = 'people_update'
              and qual like '%is_team_cmd%')),
  (27, '05', 'אמר״ל אישי וצ׳ שלו',
   exists (select 1 from information_schema.columns
            where table_name = 'people_view' and column_name = 'nvg_serial')),
  (28, '05', 'סוג אימון — רטוב, חלקי או יבש',
   exists (select 1 from information_schema.columns
            where table_name = 'trainings_view' and column_name = 'fire_mode')),
  (29, '05', 'תשובת נוכחות ניתנת פעם אחת',
   exists (select 1 from pg_policies
            where tablename = 'attendance' and policyname = 'attendance_update'
              and qual not like '%me_id%')),
  (30, '05', 'נהג הוא סימון בפני עצמו, בנוסף לתפקיד',
   exists (select 1 from information_schema.columns
            where table_name = 'people_view' and column_name = 'is_driver')),
  (31, '05', 'מאבטח ונהג אינם נדרשים בכל אימון',
   not (select essential_roles && array['מאבטח', 'נהג'] from public.settings limit 1)),
  -- הבדיקה הקריטית מבין כולן: מי שלא נכנס למערכת לא רואה שום דבר.
  -- התצוגות רצות בהרשאות הבעלים ואינן עוברות דרך מדיניות השורות, ולכן
  -- אם ההרשאה הזאת פתוחה — כל מי שמחזיק את המפתח הציבורי קורא את כל היחידה.
  (32, '05', 'מי שלא נכנס אינו רואה שמות, טלפונים או לו״ז',
   not has_table_privilege('anon', 'public.people_view', 'select')
   and not has_table_privilege('anon', 'public.trainings_view', 'select')),
  (33, '05', 'אבל בקשת הצטרפות מבחוץ עדיין נכנסת',
   has_table_privilege('anon', 'public.join_requests', 'insert'))
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
   and (select count(*) from public.teams where id = 'c' and attends_all) = 1
   and to_regclass('public.drill_results') is not null
   and to_regclass('public.periods') is not null
   and to_regclass('public.fleet') is not null
   and to_regprocedure('public.is_sergeant()') is not null
   and (select count(*) from pg_policies
         where tablename = 'fleet' and policyname = 'fleet_write'
           and qual like '%is_rasap%') = 1
   and to_regclass('public.training_guests') is not null
   and exists (select 1 from pg_trigger
                where tgname = 'vehicles_driver_guard' and not tgisinternal)
   and exists (select 1 from information_schema.columns
                where table_name = 'people_view' and column_name = 'nvg_serial')
   and exists (select 1 from information_schema.columns
                where table_name = 'trainings_view' and column_name = 'fire_mode')
   and not has_table_privilege('anon', 'public.people_view', 'select')
  then '✅ הכול ירד. המערכת מעודכנת.'
  else '❌ משהו חסר — ראה את השורות המסומנות למעלה.'
end as "סיכום";
