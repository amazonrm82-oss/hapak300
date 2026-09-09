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
-- patch-01 → patch-02 → patch-03a → patch-03b → patch-04 → patch-05 → patch-05b → patch-06 → patch-07 → patch-08 → patch-09 → patch-10 → patch-11 → patch-12 → patch-13
--
-- או פשוט: update-1.sql ואז update-2.sql, שהם כל אלה לפי הסדר.
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
   has_table_privilege('anon', 'public.join_requests', 'insert')),

  -- ── patch-06 ──
  (34, '06', 'היעדרות עם תאריכים — קורס, אשפוז, חו״ל',
   exists (select 1 from information_schema.columns
            where table_name = 'people_view' and column_name = 'absent_from')),
  (35, '06', 'ומי שבהיעדרות יורד מהמצבת של אותו אימון',
   to_regprocedure('public.is_absent_on(uuid, date)') is not null
   and (select pg_get_functiondef(oid) from pg_proc where proname = 'training_participants')
       like '%is_absent_on%'),
  (36, '06', 'סוג האימון (יבש/חלקי/רטוב) נשמר גם ביצירה',
   (select pg_get_functiondef(oid) from pg_proc where proname = 'create_trainings')
   like '%fire_mode%'),

  -- ── patch-07 ──
  (37, '07', 'כוונת אישית וצ׳ שלה',
   exists (select 1 from information_schema.columns
            where table_name = 'people_view' and column_name = 'sight_serial')),
  (38, '07', 'וסמל הצוות רשאי לרשום אותה',
   (select pg_get_functiondef(oid) from pg_proc where proname = 'guard_people_self_edit')
   like '%sight_serial%'),

  -- ── patch-08 ──
  (39, '08', 'נפ״ק — מי נוסע באיזה רכב, ומתי הוצא',
   to_regclass('public.npak') is not null),
  (40, '08', 'והוא נקרא רק על ידי מי שרשאי לראות מספרים אישיים',
   exists (select 1 from pg_policies
            where tablename = 'npak' and policyname = 'npak_read'
              and qual like '%is_team_cmd%')),

  -- ── patch-09 ──
  (41, '09', 'המפקדה היא תקן — מח״ט וסמח״ט בלבד',
   exists (select 1 from pg_trigger
            where tgname = 'people_staff_guard' and not tgisinternal)),

  -- ── patch-10 ──
  (42, '10', 'מח״ט אחד וסמח״ט אחד, ולא יותר',
   (select count(*) from pg_indexes
     where tablename = 'people'
       and indexname in ('people_one_mahat', 'people_one_smahat')) = 2),
  (43, '10', 'ושניהם מוזנים ביד, רק על ידי מנהל או מפקד חפ״ק',
   (select pg_get_functiondef(oid) from pg_proc where proname = 'guard_staff_seat')
   like '%יכולים לשבץ מח״ט%'),

  -- ── patch-11 ──
  (44, '11', 'כל אחד מעדכן את הצ׳ים של עצמו — נשק, אמר״ל וכוונת',
   (select pg_get_functiondef(oid) from pg_proc where proname = 'guard_people_self_edit')
   like '%''notif'', ''updated_at'',%'),

  -- ── patch-12 ──
  (45, '12', 'מי שבמפקדה מצרף את עצמו לכל אימון',
   to_regprocedure('public.is_staff()') is not null
   and exists (select 1 from pg_policies
                where tablename = 'training_guests' and policyname = 'guests_write'
                  and with_check like '%is_staff%')),

  -- ── patch-13 ──
  (46, '13', 'קצין אג״ם עומד במפקדה, אחד בלבד',
   exists (select 1 from pg_indexes
            where tablename = 'people' and indexname = 'people_one_agam')),
  (47, '13', 'ובאותם כללים של מח״ט — הזנה ידנית על ידי מנהל או מפקד חפ״ק',
   (select pg_get_functiondef(oid) from pg_proc where proname = 'guard_staff_seat')
   like '%קצין אג״ם%')
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
   and exists (select 1 from information_schema.columns
                where table_name = 'people_view' and column_name = 'absent_from')
   and exists (select 1 from information_schema.columns
                where table_name = 'people_view' and column_name = 'sight_serial')
   and to_regclass('public.npak') is not null
   and exists (select 1 from pg_trigger
                where tgname = 'people_staff_guard' and not tgisinternal)
   and (select count(*) from pg_indexes
         where tablename = 'people'
           and indexname in ('people_one_mahat', 'people_one_smahat', 'people_one_agam')) = 3
  then '✅ הכול ירד. המערכת מעודכנת.'
  else '❌ משהו חסר — ראה את השורות המסומנות למעלה.'
end as "סיכום";
