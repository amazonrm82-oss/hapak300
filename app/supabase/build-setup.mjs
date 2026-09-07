/**
 * Builds `setup.sql` — the single file the unit pastes into Supabase's SQL
 * editor — from the migrations and the seed.
 *
 * The migrations are the source of truth; this file exists so a fix never lands
 * in one place and not the other. Run it after editing anything under
 * migrations/ or seed.sql:
 *
 *     node supabase/build-setup.mjs
 *
 * One rule the output must keep: no `*` followed by `/` anywhere. That sequence
 * closes a block comment early and takes the whole paste down with it — it is
 * how a cron expression in a comment once broke the setup. The build fails
 * loudly rather than shipping it.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const HEADER = `-- ═══════════════════════════════════════════════════════════════════════════
--  כשירות חפ״ק מח״ט 300 — הקמת בסיס הנתונים
--
--  קובץ אחד להדבקה אחת: פתח בדשבורד של Supabase את SQL Editor → New query,
--  הדבק את כל התוכן של הקובץ הזה, ולחץ Run.
--
--  הכול רץ כטרנזקציה אחת — אם משהו נכשל, שום דבר לא נשמר וניתן לתקן ולהריץ
--  שוב. הרצה חוזרת אחרי הצלחה תיכשל על טבלאות שכבר קיימות; זה תקין ומכוון.
--
--  אחרי שזה עבר בהצלחה יש לך: כל הטבלאות, ההרשאות, הפונקציות, שני הצוותים,
--  עשרת נושאי האימון עם הוראות הבטיחות, המאגרים — ושני אנשים בלבד:
--    רס״ן מתן זזון   · 8409505 · מנהל מערכת
--    סרן  ישראל קדוש · 7387250 · מפקד החפ״ק
--
--  אין אימונים ואין נתוני דמו. את הלוחמים ואת הסבב מזינים מתוך המערכת.
--
--  (למפתחים: הקבצים ב-supabase/migrations/ הם אותו תוכן, מפוצל לפי מיגרציות,
--   לשימוש עם \`supabase db push\`. הקובץ הזה נוצר מהם על ידי build-setup.mjs.)
-- ═══════════════════════════════════════════════════════════════════════════
`;

/** Hebrew banner per migration, keyed by the part of the name after the stamp. */
const TITLES = {
  init: 'טבלאות',
  rls: 'הרשאות (RLS) — מי רשאי לראות ולשנות מה',
  functions: 'פעולות מרובות-שורות (אישור נוכחות, יצירת סבב, דחייה, ביטול)',
  auth: 'כניסה: איפוס קוד והגבלת ניסיונות',
  automations: 'אוטומציות ותזכורות',
  seed: 'נתוני פתיחה',
};

const banner = (title) =>
  [
    '',
    '',
    '',
    '-- ╔══════════════════════════════════════════════════════════════════════╗',
    `-- ║  ${title}`,
    '-- ╚══════════════════════════════════════════════════════════════════════╝',
    '',
  ].join('\n');

const parts = [HEADER];

const migrations = readdirSync(join(here, 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();

for (const file of migrations) {
  const key = file.replace(/^\d+_/, '').replace(/\.sql$/, '');
  const title = TITLES[key];
  if (!title) throw new Error(`אין כותרת מוגדרת ל-${file} — הוסף אותה ל-TITLES`);
  parts.push(banner(title), readFileSync(join(here, 'migrations', file), 'utf8'));
}

parts.push(banner(TITLES.seed), readFileSync(join(here, 'seed.sql'), 'utf8'));

const out = parts.join('\n').replace(/\n{4,}/g, '\n\n\n');

const bad = out.indexOf('*/');
if (bad !== -1) {
  const line = out.slice(0, bad).split('\n').length;
  throw new Error(
    `setup.sql מכיל את הרצף שסוגר הערה, בשורה ${line} — הוא ישבור את ההדבקה. הסר אותו.`,
  );
}

writeFileSync(join(here, 'setup.sql'), out);
console.log(`setup.sql: ${out.split('\n').length} שורות, ${migrations.length} מיגרציות + seed`);
