# בדיקות בסיס הנתונים

הבדיקות רצות על Postgres מקומי ומאמתות את מה שחשוב באמת: שההרשאות נאכפות
בבסיס הנתונים, ולא רק בממשק. אין צורך בפרויקט Supabase.

```bash
# מריצים כמשתמש לא-root, עם Postgres 16 מותקן
export PATH=$PATH:/usr/lib/postgresql/16/bin
initdb -D /tmp/pgtest -U postgres --auth=trust
pg_ctl -D /tmp/pgtest -o "-p 55432 -k /tmp/pgsock" -l /tmp/pg.log start

createdb -h /tmp/pgsock -p 55432 -U postgres hapak
psql -h /tmp/pgsock -p 55432 -U postgres -d hapak -f supabase/tests/00_supabase_stubs.sql
psql -h /tmp/pgsock -p 55432 -U postgres -d hapak --single-transaction -f supabase/setup.sql
psql -h /tmp/pgsock -p 55432 -U postgres -d hapak -f supabase/tests/01_permissions.sql
```

**הרץ תמיד על בסיס נתונים נקי** — הבדיקות מוסיפות נתונים, והרצה שנייה על אותו
בסיס תיכשל על ספירות ומפתחות כפולים.

## מה נבדק (26 בדיקות)

**סכמה ופעולות** — יצירת אימון עם כל הלוגיסטיקה בקריאה אחת, מספר אימון רץ,
שיבוץ אוטומטי של רכב פינוי וחובש תורן, והתראה לצוות על אימון שפורסם.

**מה מותר למנהל** — הוספת לוחם, עריכתו והסרתו.

**מה חסום ללוחם רגיל** — לראות מספר אישי של אחר, לאשר נוכחות (של עצמו או של
אחרים), לדרג, לסמן נוכחות של לוחם אחר, לרשום ״לא מגיע״ בלי סיבה, ולהעניק
לעצמו הרשאות.

**אישור סופי** — מי שלא הגיב נרשם ״לא מגיע״ אוטומטית, מי שכן סימן שומר על
הסטטוס שלו, ופתיחה מחדש מוחקת רק את הסימונים האוטומטיים.
