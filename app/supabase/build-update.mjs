/**
 * Builds `update-1.sql` and `update-2.sql` — the two pastes that bring a
 * database that was set up at any point in the past up to today.
 *
 * The unit should not have to remember which patch it ran. Every patch file is
 * written to be safe to run again (`if not exists`, `create or replace`, `drop
 * … if exists` before every trigger and policy), so the honest answer to "what
 * do I need to run" is "all of it, in order" — and that is what these two files
 * are.
 *
 * Why two and not one: `alter type … add value` must be committed before the
 * new value can be used, and Supabase's SQL editor runs one paste as one
 * transaction. So the enum change ends the first paste and everything that
 * uses it starts the second.
 *
 *     node supabase/build-update.mjs
 *
 * Run it after adding a patch. The same rule as build-setup.mjs applies: no
 * `*` followed by `/` anywhere, or the block comment closes early and takes the
 * rest of the paste down with it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), 'utf8').trimEnd();

/** Everything up to and including the enum value, which must commit on its own. */
const PART1 = ['patch-01-admin-rank.sql', 'patch-02-period.sql', 'patch-03a-sadir-enum.sql'];

/** Everything that follows, in order. */
const PART2 = [
  'patch-03b-sadir.sql',
  'patch-04-drills.sql',
  'patch-05-roles.sql',
  'patch-05b-lockdown.sql',
  'patch-06-absence.sql',
  'patch-07-sight.sql',
  'patch-08-npak.sql',
  'patch-09-staff.sql',
  'patch-10-one-mahat.sql',
  'patch-11-own-kit.sql',
  'patch-12-staff-joins.sql',
];

const banner = (n, of, what, after) => `-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון המערכת — הדבקה ${n} מתוך ${of}
--
--  ${what}
--
--  אין צורך לדעת מה כבר הורץ. כל מה שכאן בטוח להריץ שוב: מה שכבר קיים נשאר
--  כמו שהוא, ומה שחסר נוסף. שום נתון קיים — לוחמים, אימונים, נוכחות — לא
--  נמחק ולא משתנה.
--
--  איך: בדשבורד של Supabase → SQL Editor → New query → הדבק הכול → Run.
--  ${after}
-- ═══════════════════════════════════════════════════════════════════════════
`;

/**
 * `create or replace view` may only append columns. An early patch defines
 * `people_view` with eleven columns; a later one defines it with twenty. Run in
 * order on a fresh database that is fine — but run the early patch again on a
 * database that already has the later one and Postgres refuses:
 *
 *     ERROR: cannot drop columns from view
 *
 * which is exactly what happens to a unit that reruns the whole chain to be
 * sure. Nothing depends on either view (a function mentions one in a string,
 * and function bodies are not tracked), so dropping and recreating is safe, and
 * the grants are restored at the end of the file.
 */
const dropFirst = (sql) =>
  sql.replace(
    /create or replace view (\w+) as/g,
    (_, name) => `drop view if exists ${name} cascade;\ncreate view ${name} as`,
  );

/** What a rebuilt view must get back: readable signed in, invisible signed out. */
const REGRANT = `

-- ───────────────────────────────────────────────────────────────────────────
-- הרשאות הקריאה על התצוגות, אחרי שנבנו מחדש
--
-- תצוגה שנמחקה ונבנתה מחדש מאבדת את ההרשאות שלה. בלי השורות האלה אף אחד לא
-- היה רואה שמות עד ההדבקה הבאה — ומי שלא נכנס למערכת היה עלול כן לראות.
-- ───────────────────────────────────────────────────────────────────────────

grant select on people_view to authenticated;
grant select on trainings_view to authenticated;
revoke all on people_view from anon;
revoke all on trainings_view from anon;
`;

const write = (file, banner_, files, tail = '') => {
  const body = files
    .map((f) => `\n\n-- ───────────────────────────────────────────────────────────────────────────\n-- ${f}\n-- ───────────────────────────────────────────────────────────────────────────\n\n${read(f)}`)
    .join('\n');
  const out = `${banner_}${dropFirst(body)}\n${tail}`;
  if (out.includes('*/')) throw new Error(`${file}: block comment closes early`);
  writeFileSync(join(here, file), out);
  console.log(`${file}: ${out.split('\n').length} שורות, ${files.length} קבצים`);
};

write(
  'update-1.sql',
  banner(1, 2, 'עדכונים 1–3א׳.', 'כשזה עבר — עבור ל-update-2.sql. חייבים את שניהם, בסדר הזה.'),
  PART1,
  REGRANT,
);
write(
  'update-2.sql',
  banner(2, 2, 'עדכונים 3ב׳–12. להריץ אחרי update-1.sql.', 'כשזה עבר — הרץ את verify.sql כדי לראות טבלה של ✅ על הכול.'),
  PART2,
  REGRANT,
);
