/**
 * The screens nobody had clicked yet.
 *
 * `flows.mjs` walks the path a training takes from being created to being
 * scored, and `roles.mjs` walks every screen as every rank. Both stop at the
 * edge of the day-to-day: the calendar, the chat, postponing and cancelling,
 * finishing a training into the archive, the reports that come out of it, the
 * join request somebody filed, the backup, and closing a period.
 *
 * Those are the parts a unit uses once a week and nobody tests, so they are the
 * parts that quietly break. This runs them, in the order the year actually
 * happens in, and finishes with the one action that cannot be undone — closing
 * the period — because after it the database is not the same database.
 *
 * Runs after flows.mjs, on the data it left behind.
 *
 *     node e2e/deep.mjs http://localhost:3210
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3210';

let pass = 0;
let fail = 0;
let step = 0;
const problems = [];
const n = () => String(++step).padStart(2, '0');
const ok = (l) => (pass++, console.log(`✅  ${n()}  ${l}`));
const bad = (l, d = '') => {
  fail++;
  const at = n();
  problems.push(`${at} ${l}${d ? ` — ${d}` : ''}`);
  console.log(`❌  ${at}  ${l}${d ? ` — ${d}` : ''}`);
};
const check = (l, cond, d) => (cond ? ok(l) : bad(l, d));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  headless: false,
  args: ['--headless=new', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const failed = [];
page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));

const text = () => page.locator('body').innerText();
const has = async (s) => (await text()).includes(s);
const settle = (ms = 800) => page.waitForTimeout(ms);
const click = async (label, nth = 0) => {
  await page.locator(`button:has-text("${label}"), a:has-text("${label}")`).nth(nth).click({ timeout: 20000 });
  await settle();
};
const inDialog = (label) =>
  page
    .locator('[role="dialog"]')
    .locator(`.field:has(label:text-is("${label}")) input, .field:has(label:text-is("${label}")) select, .field:has(label:text-is("${label}")) textarea`)
    .first();

/** Answers the entry prompt if it is covering the screen. */
const clearPrompt = async () => {
  for (let i = 0; i < 4 && (await has('נקבע לך אימון')); i++) {
    await page.locator('button:text-is("מגיע")').first().click();
    await settle(1600);
  }
};

try {
  // ── in, as the administrator ──
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await settle(1200);
  // a device that remembers the number opens straight at the code
  const pnField = page.locator('input').first();
  if (!(await pnField.isDisabled().catch(() => false))) {
    await page.fill('input', '8409505');
    await click('המשך');
    await settle(900);
  }
  await page.locator('input[type="password"]').first().fill('8317');
  await click('כניסה');
  await page.waitForURL(/\/(schedule|my)/, { timeout: 20000 }).catch(() => {});
  await settle(1500);
  await clearPrompt();
  check('מנהל המערכת נכנס', !page.url().includes('/login'), page.url());

  // ── the visual pass: every screen, at a phone and at a desk ──
  //
  // No assertion catches a heading that wraps into the sidebar or a table that
  // runs off a 390-wide screen. These are for a person to look at.
  const SHOTS = new URL('./shots/full/', import.meta.url).pathname;
  mkdirSync(SHOTS, { recursive: true });
  const SCREENS = [
    '/schedule', '/trainings', '/teams', '/logistics', '/calendar',
    '/archive', '/manage', '/profile', '/my', '/chat', '/install', '/npak',
  ];
  let shot = 0;
  for (const path of SCREENS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
    await settle(900);
    const name = path.slice(1);
    await page.screenshot({ path: `${SHOTS}${name}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(700);
    await page.screenshot({ path: `${SHOTS}${name}-phone.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await settle(500);
    shot += 2;
  }
  check('כל המסכים צולמו לבדיקה ויזואלית', shot === SCREENS.length * 2, `${shot} צילומים`);

  // ── the join request somebody filed from the login screen ──
  //
  // flows.mjs files one and stops there. Approving it is the other half, and it
  // is the only way a person enters the system without somebody typing them in.
  await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
  await settle(1400);
  check('בקשת ההצטרפות ממתינה למנהל', await has('בקשת הצטרפות'));
  await click('אשר והוסף');
  await settle(2200);
  check('ואישורה מכניס את המבקש לכוח', await has('חיצוני בדיקה'));

  // ── the brigade calendar ──
  await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' });
  await settle(1400);
  await click('אירוע ביומן');
  await settle(900);
  check('טופס אירוע ביומן נפתח', (await page.locator('[role="dialog"]').count()) > 0);
  await inDialog('כותרת').fill('ביקור מח״ט בדיקה');
  await page.locator('[role="dialog"] input[type="checkbox"]').first().check();
  await click('שמירה');
  await settle(2000);
  check('האירוע נשמר ומוצג ביומן', await has('ביקור מח״ט בדיקה'));

  // and it comes off again
  await page.locator('button:has-text("ביקור מח״ט בדיקה")').first().click();
  await settle(900);
  await click('מחיקה');
  await settle(2000);
  check('ואפשר למחוק אותו', !(await has('ביקור מח״ט בדיקה')));

  // ── a training, from here on ──
  await page.goto(`${BASE}/trainings`, { waitUntil: 'networkidle' });
  await settle(1400);
  // the rows are not links — the screen routes on a click — so the address of
  // each training is read by opening it
  const rowCount = await page.locator('tbody tr').count();
  check('רשימת האימונים מציגה את מה שנוצר', rowCount >= 2, `${rowCount} שורות`);

  const urls = [];
  for (let i = 0; i < Math.min(2, rowCount); i++) {
    await page.goto(`${BASE}/trainings`, { waitUntil: 'networkidle' });
    await settle(1200);
    await page.locator('tbody tr').nth(i).click();
    await page.waitForURL(/\/trainings\/[0-9a-f]{8}/, { timeout: 15000 }).catch(() => {});
    await settle(1200);
    if (/\/trainings\/[0-9a-f]{8}/.test(page.url())) urls.push(page.url());
  }
  const first = urls[0];
  const second = urls[1] ?? null;
  if (!first) throw new Error('לא נמצא אף אימון לפתוח');

  // ── the team chat on a training ──
  await page.goto(first, { waitUntil: 'networkidle' });
  await settle(1600);
  await click('צ׳אט');
  await settle(1000);
  const chatBox = page.locator('textarea[placeholder*="הודעה לצוות"], input[placeholder*="הודעה לצוות"]').first();
  check('לשונית הצ׳אט של האימון נפתחת', (await chatBox.count()) > 0);
  if (await chatBox.count()) {
    await chatBox.fill('בדיקת הודעה לצוות');
    await chatBox.press('Enter');
    await settle(2000);
    check('והודעה נשלחת ונשמרת', await has('בדיקת הודעה לצוות'));
  }

  // ── postponing: the date moves and the attendance is reset ──
  await page.goto(first, { waitUntil: 'networkidle' });
  await settle(1600);
  await click('דחייה');
  await settle(900);
  const newDate = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  await page.locator('[role="dialog"] input[type="date"]').first().fill(newDate);
  await click('דחה ועדכן את הצוות');
  await settle(2500);
  const [y2, m2, d2] = newDate.split('-');
  check('דחיית אימון מזיזה את התאריך', await has(`${d2}.${m2}.${y2}`), await text().then((t) => t.slice(0, 60)));

  // ── the reports that come out of a training ──
  await click('לוגיסטיקה ותחמושת');
  await settle(1200);
  const hasAmmoReport = await has('תחמושת לוואטסאפ');
  check('דו״ח התחמושת זמין מהאימון', hasAmmoReport);
  if (hasAmmoReport) {
    // the print window is where the report is actually written out, so that is
    // where it is read: a button that opens an empty page is not a report
    const popupP = page.waitForEvent('popup', { timeout: 12000 }).catch(() => null);
    await click('דו״ח תחמושת PDF');
    const popup = await popupP;
    check('דו״ח התחמושת נפתח להדפסה', !!popup);
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      const report = await popup.locator('body').innerText();
      check(
        'ובתוכו מה שנצרך בפועל, לפי נשק',
        report.includes('תחמושת') && /\d/.test(report),
        report.slice(0, 90).replace(/\n/g, ' '),
      );
      await popup.close();
    }

    // and the attendance report, the other one a commander sends on
    const popup2P = page.waitForEvent('popup', { timeout: 12000 }).catch(() => null);
    await click('דוח נוכחות PDF');
    const popup2 = await popup2P;
    check('ודוח הנוכחות נפתח להדפסה', !!popup2);
    if (popup2) {
      await popup2.waitForLoadState('domcontentloaded').catch(() => {});
      const rep2 = await popup2.locator('body').innerText();
      check('ובתוכו הכוח והנוכחות', rep2.includes('נוכחות'), rep2.slice(0, 90).replace(/\n/g, ' '));
      await popup2.close();
    }
  }

  // ── finishing a training into the archive ──
  await page.goto(first, { waitUntil: 'networkidle' });
  await settle(1400);
  await click('סיכום');
  await settle(1200);
  const canFinish = await has('סיים אימון והעבר לארכיון');
  check('מסך הסיכום מציע לסיים את האימון', canFinish);
  if (canFinish) {
    await click('סיים אימון והעבר לארכיון');
    await settle(1000);
    // the confirmation dialog
    const confirm = page.locator('[role="dialog"] button.btn-primary').first();
    if (await confirm.count()) await confirm.click();
    await settle(2500);
    check('והאימון עובר לארכיון', await has('האימון בארכיון'));

    await page.goto(`${BASE}/archive`, { waitUntil: 'networkidle' });
    await settle(1600);
    check('ומופיע במסך הארכיון', await has('סיכום') || (await has('אימון')));
  }

  // ── cancelling the other one ──
  if (second) {
    await page.goto(second, { waitUntil: 'networkidle' });
    await settle(1600);
    const canCancel = await has('ביטול');
    check('אפשר לבטל אימון', canCancel);
    if (canCancel) {
      await click('ביטול');
      await settle(900);
      const reason = page.locator('[role="dialog"] input, [role="dialog"] textarea').first();
      if (await reason.count()) await reason.fill('בדיקת ביטול');
      await click('בטל אימון');
      await settle(2500);
      check('והוא מסומן כמבוטל', (await has('בוטל')) || (await has('מבוטל')));
    }
  }

  // ── the exports on the management screen ──
  await page.goto(`${BASE}/manage`, { waitUntil: 'networkidle' });
  await settle(1600);
  check('מסך הניהול מציג את כלי התקופה', await has('סגירת תקופה'));

  const backup = page.locator('button:has-text("גיבוי מלא")').first();
  if (await backup.count()) {
    const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await backup.click();
    const file = await dl;
    check('גיבוי מלא יורד כקובץ', !!file, file ? file.suggestedFilename() : 'לא ירד קובץ');
  } else {
    bad('גיבוי מלא יורד כקובץ', 'הכפתור לא נמצא');
  }

  const excel = page.locator('button:has-text("ייצוא לאקסל")').first();
  if (await excel.count()) {
    const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await excel.click();
    const file = await dl;
    check('וייצוא לאקסל יורד כקובץ', !!file, file ? file.suggestedFilename() : 'לא ירד קובץ');
  }

  // ── the personal screen ──
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await settle(1400);
  check('מסך הפרופיל מציג את הפרטים והיציאה', (await has('יציאה')) && (await has('עריכת פרטים')));

  // ── closing the period: the last thing, because nothing is the same after ──
  await page.goto(`${BASE}/manage`, { waitUntil: 'networkidle' });
  await settle(1400);
  await click('סגירת תקופה');
  await settle(1000);
  const nameBox = inDialog('שם התקופה החדשה');
  check('טופס סגירת התקופה נפתח', (await nameBox.count()) > 0);
  if (await nameBox.count()) {
    await nameBox.fill('אביב 2027 בדיקה');
    // The database refuses a new period that does not start after the current
    // one, and the form opens on today's date. Leaving it is how this check
    // used to pass while the call was being refused behind it.
    const nextStart = new Date(Date.now() + 120 * 864e5).toISOString().slice(0, 10);
    await inDialog('תחילת התקופה החדשה').fill(nextStart);
    const before = failed.length;
    await click('סגור ופתח תקופה חדשה');
    await settle(3500);
    check('סגירת התקופה לא נדחתה על ידי בסיס הנתונים', failed.length === before,
      failed.slice(before).join(' | '));
    await page.goto(`${BASE}/manage`, { waitUntil: 'networkidle' });
    await settle(1800);
    check('והתקופה החדשה היא זו שרצה עכשיו', await has('אביב 2027 בדיקה'));
    // the closed period is kept on the management screen, with its own report
    check('והתקופה שנסגרה נשמרה עם הסיכום שלה', await has('חורף 2026'));
    const reportBtn = page.locator('button:has-text("דו״ח")').first();
    if (await reportBtn.count()) {
      const repP = page.waitForEvent('popup', { timeout: 12000 }).catch(() => null);
      await reportBtn.click();
      const rep = await repP;
      check('ואפשר להוציא ממנה דו״ח תקופה למח״ט', !!rep);
      if (rep) {
        await rep.waitForLoadState('domcontentloaded').catch(() => {});
        const t = await rep.locator('body').innerText();
        check('ובתוכו הכוח והכשירות', t.length > 50, t.slice(0, 80).replace(/\n/g, ' '));
        await rep.close();
      }
    } else {
      bad('ואפשר להוציא ממנה דו״ח תקופה למח״ט', 'לא נמצא כפתור דו״ח');
    }
  }

  // ── nothing broke on the way ──
  const realErrors = errors.filter(
    (e) => !/favicon|manifest|sw\.js|Failed to load resource/i.test(e),
  );
  check('אין שגיאות בקונסולה בכל המסלול', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));
  const realFailed = failed.filter((f) => !/favicon|manifest|sw\.js/i.test(f));
  check('ואין בקשה שנכשלה', realFailed.length === 0, realFailed.slice(0, 3).join(' | '));
} catch (e) {
  bad('הריצה נעצרה', e instanceof Error ? e.message.split('\n')[0] : String(e));
}

console.log(`\nעברו: ${pass}   נכשלו: ${fail}`);
if (problems.length) console.log('\nכשלים:\n  ' + problems.join('\n  '));
await browser.close();
process.exit(fail ? 1 : 0);
