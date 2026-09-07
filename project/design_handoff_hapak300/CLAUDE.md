# CLAUDE.md — בניית המערכת האמיתית: כשירות חפ״ק מח״ט 300

אתה בונה מערכת ייצור מלאה על בסיס אב-טיפוס HTML שנמצא בתיקייה זו. **המטרה: לשחזר אחד-לאחד את המראה, המסכים, הכללים העסקיים והרשאות של האב-טיפוס — עם שרת אמיתי, נתונים משותפים לכל המשתמשים, והתראות אמיתיות.** קרא את `README.md` (מפרט מלא) ואת `hapak-core.js` (כל הלוגיקה העסקית) לפני שאתה כותב שורת קוד.

## 1. מה יש בתיקייה
- `README.md` — מפרט מוצר מלא: מסכים, כללים עסקיים, מודל נתונים, מטריצת הרשאות, טוקני עיצוב.
- `hapak-core.js` — **מקור האמת ללוגיקה**: מודל הנתונים (`buildSeed`, `makeTraining`), הרשאות (`permsFor`), סטטיסטיקות נוכחות (`attendanceStats`), התרעות למפקד (`trainingAlerts`), הצעת מחליף (`suggestSubstitute`), כשירות (`readinessOf`), אוטומציות/תזכורות (`runAutomations`), יצירת סבב (`generateRotation`), ייצוא (`attendanceCSV`, `orderHTML`), תאריכים ושבועות (`weekOf`, `sunTimes`). תרגם את הפונקציות האלה 1:1 — אל תמציא כללים חדשים.
- `Hapak Web.dc.html` — האתר (תבנית HTML עם `{{ }}` + מחלקת לוגיקה JS). קרא את התבנית כדי לשחזר פריסה, טקסטים בעברית וסדר רכיבים במדויק.
- `Hapak Mobile App.dc.html` — האפליקציה (5 לשוניות תחתונות). `Hapak Mobile.dc.html` — רק תצוגה במסגרות טלפון, לא לשחזר.
- `hapak-theme.css` + `_ds/.../styles.css` — כל הצבעים, הרדיוסים, הריווח והצללים. **השתמש בערכים האלה בדיוק.**
- `assets/emblem.png` — סמל היחידה.

## 2. סטאק (החלטה סופית)
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind, RTL (`dir="rtl" lang="he"`), גופן Heebo/Inter. אפליקציה = אותו אתר כ-**PWA** (manifest, service worker, התקנה למסך הבית) עם פריסת מובייל זהה לאב-הטיפוס (לשוניות תחתונות: לו״ז · האימון שלי · צ׳אט · הצוות · פרופיל). אין אפליקציית native בשלב זה.
- **Backend**: Supabase — Postgres + RLS, Auth, Realtime, Storage, Edge Functions (Deno), pg_cron.
- **פוש**: Web Push (VAPID) דרך service worker; שמור subscriptions בטבלה `push_subscriptions`.
- **Hosting**: Vercel (frontend) + Supabase Cloud. סודות ב-`.env.local` בלבד, אף פעם לא בקוד.

## 3. אימות והרשאות — חובה
- כניסה: **מספר אישי (7 ספרות) + קוד 4 ספרות**. בכניסה ראשונה המשתמש בוחר קוד (שתי הקלדות; חסום `1234` וספרה חוזרת). הקוד נדרש **בכל כניסה** — אין "זכור אותי".
- מימוש: Edge Function `auth-login` מקבלת `{pn, pin}` → מאמתת `people.pin_hash` (argon2/bcrypt) → מנפיקה סשן Supabase (משתמש Auth עם אימייל סינתטי `<pn>@hapak300.local`; הסיסמה = סוד שרתי נגזר, לא הקוד עצמו). `auth-set-pin` לכניסה ראשונה / אחרי איפוס. איפוס קוד: `people.pin_hash = NULL` — מנהל מערכת / מפקד חפ״ק בלבד.
- **רק מי שמנהל/מפקד חפ״ק הוסיף לטבלת `people` יכול להיכנס.** בקשת הצטרפות (`join_requests`) לא מקנה גישה עד אישור.
- תפקידים: דגלים על `people` — `is_admin`, `is_hapak_commander`, `is_team_commander`, `is_instructor`; ברירת מחדל לוחם. JWT custom claims: `person_id, team_id, is_admin, is_hapak_commander, is_team_commander, is_instructor`. **RLS על כל טבלה לפי מטריצת ההרשאות ב-README (סעיף "מטריצת הרשאות")** — מספרים אישיים גלויים למפקדים בלבד (View נפרד ללוחמים ללא `pn`).

## 4. סכמה
צור מיגרציה `supabase/migrations/0001_init.sql` עם כל הטבלאות מסעיף "מודל נתונים" ב-README: `settings, teams, people, topics, trainings, day_blocks, attendance, gear_items, gear_catalog, vehicles, vehicle_types, ammo, food, chat_messages, feedback, photos, calendar_events, notifications, notification_reads, join_requests, reminders_sent, push_subscriptions, locations`. UUID לכל id, `created_at/updated_at` עם trigger. אינדקסים: `trainings(date)`, `attendance(training_id, person_id)` unique, `people(pn)` unique, `chat_messages(training_id, time)`.
- `trainings.seq` מחושב (View או trigger): מספר רץ לפי תאריך בתוך `team_id`, לא כולל `cancelled`.
- Seed (`supabase/seed.sql`): `settings` שורה אחת (ערכים מ-`buildSeed` ב-hapak-core.js: `period_start='2026-09-20'`, `period_name='חורף 2026'`, `min_attendance=6`, `essential_roles={חובש,נהג,מאבטח}`, `invite_hours=48`, `evening_reminder='18:00'`, `morning_reminder_before=120`, `cert_alert_days=30`, `summary_lock_days=7`, `real_mode=true`), שני צוותים ("צוות א׳", "צוות ב׳"), 10 נושאים עם הוראות הבטיחות מ-`TOPICS`, מאגרי ציוד/רכבים/נשק מ-`GEAR_CATALOG / VEHICLE_TYPES / WEAPONS`, ושני אנשים בלבד: רס״ן מתן זזון (8409505, 052-5621437, `is_admin`) וסרן ישראל קדוש (7387250, 058-5455567, `is_hapak_commander`). **אין אימונים ואין נתוני דמו.**

## 5. לוגיקה בצד שרת (Edge Functions + SQL)
תרגם מ-`hapak-core.js`:
- `attendance_stats(training)`, `training_alerts(training)`, `readiness(team|person)` — כ-SQL views/functions או בשכבת השרת; אותם ספים ומשקלים (כשירות: דירוג מפקד 50% · נוכחות מאושרת 25% · נושאים שהושלמו 25%).
- `suggest_substitute(training, role)` — אותו ניקוד: מוסמך לנושא +4, זמין באותו יום +2, העביר את הנושא בעבר +2, מהצוות השני +1, −0.3 לכל אימון שהעביר בתקופה.
- `approve_attendance(training, person?)` — מי שלא הגיב → `absent` עם `auto=true` וסיבה "לא הגיב — נחשב לא מגיע"; רישום ב-`approval_log`; התראה למשתתפים.
- `generate_rotation(cfg)` — כמו `generateRotation`: צוות א׳ לפי סדר נושאים, צוות ב׳ שבוע אחרי (מדורג), ואז משותפים; מדריך מוסמך ראשון כהזמנה ממתינה, מפקד הצוות כמפקד אימון.
- `postpone_training` מאפס נוכחות ושולח התראה לכל הצוות; `cancel_training` שומר בארכיון עם סיבה; `delete_training` (מנהל) סופי.
- **Cron כל 10 דקות** — `run_automations` (העתק של `runAutomations`): תזכורת ערב לפני ב-18:00, תזכורת שעתיים לפני היציאה, "ממתין לסיכום" יום אחרי אימון שעבר, הזמנה ללא מענה מעל 48 שעות, הסמכה פוקעת (30 יום) — כל אחת פעם אחת (`reminders_sent`), יוצרת `notifications` + שולחת Web Push לפי הגדרות המשתמש (`people.notif`).
- Realtime על `trainings, attendance, chat_messages, notifications, gear_items, vehicles, ammo, food, calendar_events`.
- Storage buckets: `training-photos`, `training-orders`, `chat-attachments` (פרטיים; URL חתום).
- ייצוא: `export-attendance-csv` (UTF-8 BOM, עמודות: שם ודרגה, מספר אישי, צוות, תפקיד, סטטוס נוכחות, סיבה, שעת סימון, מאשר), `export-training-order-pdf` ו-`export-attendance-pdf` (מ-`orderHTML` / טבלת הנוכחות, בעזרת `pdf-lib` או puppeteer).
- מזג אוויר: Open-Meteo לפי נצ״ד (המרת רשת ישראל החדשה → WGS84 בצד שרת), מוצג כ"הערכה". זריחה/שקיעה: `sunTimes` בצד לקוח.
- יומן מח״ט: `calendar_events` ידני (מנהל/מפקד חפ״ק) + חגים; **שלב 2 (לא עכשיו)**: סנכרון Google Calendar קריאה-בלבד ב-Edge Function.

## 6. מסכים — לשחזר בדיוק
עבור לפי `README.md` → "מסכים". לכל מסך: העתק מבנה, טקסטים בעברית, סדר כפתורים, מצבי ריק והודעות toast מהתבנית ב-`Hapak Web.dc.html` / `Hapak Mobile App.dc.html` (חפש בתבנית לפי הכותרת בעברית). דגשים:
- מסך הבית = **ציר התקופה** (שבועות בעמודות, שורות צוות א׳/ב׳, משותף ממוזג) + פירוט השבוע הנבחר + יומן מח״ט + כשירות (למפקדים).
- מסך אימון: 5 לשוניות (סקירה · נוכחות · לוגיסטיקה ותחמושת · צ׳אט · סיכום), כותרת עם כל הפעולות.
- ניהול (מנהל/מפקד חפ״ק): טבלת כל האימונים בעריכה ישירה, סבב אוטומטי, הזזת לו״ז, תבנית ריקה, ניהול נושאים.
- צוותים: הוספה מהירה בשורה אחת; טופס לוחם מלא עם הרשאות, הסמכות הדרכה, הסמכות אישיות עם תוקף, איפוס קוד.
- כללי UI: RTL, שעון 24 שעות, תאריכים לועזיים `DD.MM.YYYY`, ימי שבוע א׳–ש׳, מספרים ב-`tabular-nums`, יעדי לחיצה במובייל ≥ 44px, כל מצב ריק עם הסבר ופעולה.

## 7. עיצוב — ערכים מחייבים
מ-`hapak-theme.css`: רקע `#141a0e` עם שכבות (זוהר רדיאלי `rgba(104,132,62,.42)` מלמעלה, קווי גובה טופוגרפיים — ה-SVG המלא בקובץ, רשת 96px `rgba(236,235,228,.06)`); משטח `#262824`; טקסט `#f3f2ec`; ניטרלים ואקצנט חול/פליז (`#e2bb55` בסיס, ramp 100–900 בקובץ); כותרת ותפריט תחתון `color-mix(#0d1109 84%, transparent)` + `backdrop-filter: blur(14px)`; כרטיס עם outline 1px (text@14%) וצל `0 10px 28px rgba(0,0,0,.42)`; כפתור ראשי = מסגרת אקצנט + מילוי 14%; רדיוסים/ריווח מ-`_ds/.../styles.css` (`--radius-*`, `--space-*`). הגדר את כולם כ-CSS variables / Tailwind theme ואל תשתמש בערכים אחרים.

## 8. סדר עבודה
1. `supabase init` → מיגרציה + seed + RLS + policies; בדיקות RLS (pgTAP או סקריפט) לכל שורה במטריצת ההרשאות.
2. Auth (Edge Functions `auth-login`, `auth-set-pin`, `auth-reset-pin`) + מסך כניסה.
3. מודל נתונים בצד לקוח (types מ-`supabase gen types`) + hooks Realtime.
4. מסכים לפי סדר: לו״ז → מסך אימון (5 לשוניות) → צוותים/ניהול אנשים → ניהול תקופה → לוגיסטיקה → יומן → ארכיון → פרופיל; מובייל (PWA) במקביל לכל מסך.
5. אוטומציות (cron), Web Push, ייצוא CSV/PDF, מזג אוויר.
6. בדיקות קצה-לקצה (Playwright) לתרחישים: כניסה ראשונה + קוד; מנהל מוסיף לוחם ולוחם נכנס; יצירת סבב אוטומטי; לוחם מסמן נוכחות; מפקד אימון מסכם → מפקד צוות מאשר → "לא הגיב" הופך "לא מגיע"; מדריך דוחה → מחליף מוצע; דחיית אימון מאפסת נוכחות; סיום אימון → ארכיון → משוב לוחם; הסמכה פוקעת → התרעה.

## 9. קריטריוני קבלה
- כל פעולה במטריצת ההרשאות נחסמת ב-RLS (לא רק ב-UI).
- שינוי במכשיר אחד מופיע במכשיר אחר תוך < 2 שניות (Realtime).
- אף מספר אישי אינו נחשף ללוחם רגיל (בדיקת API ישירה).
- התזכורות נשלחות פעם אחת בלבד לכל אירוע.
- הממשק זהה לאב-הטיפוס: אותם מסכים, כותרות, טקסטים, צבעים ופריסה; Lighthouse PWA installable; RTL ללא שגיאות פריסה ב-375px וב-1280px.
- אין נתוני דמו בייצור; מצב "הפעלה אמיתית" פעיל כברירת מחדל.

## 10. מה לא לעשות
- לא להעתיק את קובצי ה-`.dc.html` או `support.js` לייצור — הם אב-טיפוס.
- לא לשמור קודים בטקסט גלוי ולא להשתמש ב-`hashPin` הפשוט של האב-טיפוס.
- לא להוסיף פיצ׳רים שלא מופיעים ב-README; לא לשנות ניסוחים בעברית בלי סיבה.
- לא לשמור נתונים ב-localStorage כמקור אמת.
