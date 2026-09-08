/**
 * The whole system, driven through a real browser.
 *
 * The Next.js app is the built production one, the database is a real Postgres
 * with the real schema and the real policies, and the clicks are real clicks.
 * Only Supabase's HTTP layer is stood in for (see supabase-shim.mjs), because
 * this sandbox has no Docker and no route out.
 *
 *     node e2e/flows.mjs http://localhost:3210
 */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:3210';

let pass = 0;
let fail = 0;
const problems = [];

const ok = (n, label) => {
  pass++;
  console.log(`✅  ${String(n).padStart(2, '0')}  ${label}`);
};
const bad = (n, label, detail = '') => {
  fail++;
  problems.push(`${n} ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`❌  ${String(n).padStart(2, '0')}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const check = (n, label, cond, detail) => (cond ? ok(n, label) : bad(n, label, detail));

/** Runs a step whose whole point is to be refused. */
const refused = async (fn) => {
  refusalExpected = true;
  try {
    await fn();
  } finally {
    await page.waitForTimeout(400);
    refusalExpected = false;
  }
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  headless: false,
  args: ['--headless=new', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

// Some steps provoke a refusal on purpose — an unknown personal number, a weak
// code — and the server answering 401 or 400 there is the system working, not a
// fault. Those windows are marked, so what is left is genuinely unexpected.
let refusalExpected = false;

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !refusalExpected) consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
// the console only says "failed to load resource"; the response tells you which
const failedRequests = [];
page.on('response', (r) => {
  if (r.status() >= 400 && !refusalExpected)
    failedRequests.push(`${r.status()} ${r.request().method()} ${r.url()}`);
});

const text = () => page.locator('body').innerText();
const has = async (s) => (await text()).includes(s);
const settle = (ms = 700) => page.waitForTimeout(ms);

/** Clicks the first button whose label contains `label`. */
async function click(label, nth = 0) {
  await page.locator(`button:has-text("${label}"), a:has-text("${label}")`).nth(nth).click();
  await settle();
}

try {
  // ── 1. the login screen ──
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  check(1, 'מסך הכניסה נטען', await has('מספר אישי'));

  // ── 2. an unknown personal number is refused ──
  await page.fill('input', '9999999');
  await refused(async () => {
    await click('המשך');
    await settle(900);
  });
  check(2, 'מספר אישי לא רשום נדחה', await has('לא רשום'));

  // ── 3. the administrator's first login asks for a code, without naming them ──
  await page.reload({ waitUntil: 'networkidle' });
  await page.fill('input', '8409505');
  await click('המשך');
  await settle(900);
  const body3 = await text();
  check(3, 'מספר אישי מוכר עובר לשלב הקוד', body3.includes('קוד'));
  check(4, 'ולא חושף שם או דרגה לפני אימות', !body3.includes('מתן זזון'));

  // ── 5. choosing a code, and the weak-code rule ──
  const pins = await page.locator('input[type="password"]');
  await pins.nth(0).fill('1234');
  if ((await pins.count()) > 1) await pins.nth(1).fill('1234');
  await refused(async () => {
    await click('שמור קוד');
    await settle(900);
  });
  check(5, 'קוד חלש (1234) נדחה', await has('פחות צפוי'));

  const pins2 = await page.locator('input[type="password"]');
  await pins2.nth(0).fill('8317');
  if ((await pins2.count()) > 1) await pins2.nth(1).fill('8317');
  await click('שמור קוד');
  await page.waitForURL(/\/(schedule|my)/, { timeout: 15000 }).catch(() => {});
  await settle(1500);
  check(6, 'כניסה ראשונה מצליחה ונכנסים ללו״ז', page.url().includes('/schedule'));

  // ── 7. the code was actually stored: sign out, sign back in with it ──
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await settle();
  await click('יציאה');
  await settle(1200);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input', '8409505');
  await click('המשך');
  await settle(900);
  const askedAgain = await has('כניסה ראשונה');
  check(7, 'הכניסה השנייה מבקשת רק את הקוד, לא בחירה מחדש', !askedAgain);

  await page.locator('input[type="password"]').first().fill('8317');
  await click('כניסה');
  await page.waitForURL(/\/schedule/, { timeout: 15000 }).catch(() => {});
  await settle(1500);
  check(8, 'כניסה עם הקוד שנבחר מצליחה', page.url().includes('/schedule'));

  // ── 9. the roster, and adding a fighter to סדיר ──
  await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
  await settle(1200);
  const teamsBody = await text();
  check(9, 'מסך הצוותים מציג את שלושת הצוותים', teamsBody.includes('סדיר'));

  // the quick-add row is a set of labelled fields, so address them by label
  const byLabel = (label) =>
    page.locator(`.field:has(label:text-is("${label}")) input, .field:has(label:text-is("${label}")) select`).first();
  await byLabel('שם מלא').fill('דוד בדיקה');
  await byLabel('מספר אישי').fill('7654321');
  // pick סדיר in the team selector of the quick-add row
  await byLabel('צוות').selectOption('c');
  await click('הוסף');
  await settle(1500);
  check(10, 'הוספת לוחם לצוות סדיר', await has('דוד בדיקה'));

  // ── 11. creating a training with logistics ──
  // the create button lives on the schedule, next to the week it would fall in
  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await settle(1200);
  await click('אימון חדש');
  await settle(900);
  const dialog = await has('נושא');
  check(11, 'טופס אימון חדש נפתח', dialog);

  const today = new Date();
  const future = new Date(today.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  await page.locator('input[type="date"]').first().fill(future);
  const times = page.locator('input[type="time"]');
  await times.nth(0).fill('07:00');
  await times.nth(1).fill('17:00');
  await page.locator('input[list="hapak-locs"]').fill('שטח אימונים בדיקה');

  // commander and instructor are mandatory before it will publish
  await byLabel('מפקד אימון').selectOption({ index: 1 });
  await byLabel('מדריך').selectOption({ index: 1 });

  check(12, 'הצעת הלוגיסטיקה מופיעה בטופס', await has('ציוד נדרש'));
  check(13, 'ובתוכה מזון ומים ותחמושת', (await has('מזון ומים')) && (await has('תחמושת')));

  await click('שמירה ופרסום');
  await settle(2500);
  const created = page.url().includes('/trainings/');
  check(14, 'האימון נוצר ונפתח', created);

  if (created) {
    const trainingUrl = page.url();
    check(15, 'מסך האימון מציג לשונית מקצים', await has('מקצים'));

    // ── 16. drills ──
    await click('מקצים');
    await settle(900);
    await click('הוספת מקצה');
    await settle(600);
    await page.locator('input[placeholder*="ירי בעמידה"]').fill('ירי בעמידה');
    await page.locator('input[placeholder="20"]').fill('20');
    await page.locator('textarea').first().fill('20 כדורים, 5 מטרות, 50 מ׳');
    await click('הוסף מקצה');
    await settle(1500);
    check(16, 'מקצה נוסף לאימון', await has('ירי בעמידה'));

    // open it and record a result for one fighter. The row is addressed by his
    // name: the commander's own grade box is numeric too, and sits above the
    // table, so counting inputs from the top of the page hits the wrong one.
    await page.locator('button:has-text("ירי בעמידה")').first().click();
    await settle(800);
    const row = page.locator('tbody tr').filter({ hasText: 'דוד בדיקה' }).first();
    const numeric = row.locator('input[inputmode="numeric"]');
    if ((await numeric.count()) >= 2) {
      await numeric.nth(0).fill('20'); // כדורים
      await numeric.nth(0).blur();
      await settle(900);
      await numeric.nth(1).fill('17'); // פגיעות
      await numeric.nth(1).blur();
      await settle(1500);
      check(17, 'הציון מחושב מהפגיעות (17/20 = 85)', (await row.innerText()).includes('85.0'));
    } else {
      bad(17, 'הציון מחושב מהפגיעות', 'לא נמצאו שדות קלט בשורת הלוחם');
    }

    // ── 18. the commander's grade for the training ──
    await byLabel('ציון המפקד לאימון (0–100)').fill('88');
    await click('שמור ציון');
    await settle(1500);
    check(18, 'ציון המפקד לאימון נשמר', await has('88'));

    // ── 19. attendance ──
    await page.goto(trainingUrl, { waitUntil: 'networkidle' });
    await settle(1200);
    await click('נוכחות');
    await settle(1000);
    check(19, 'לשונית הנוכחות מציגה את הכוח', await has('דוד בדיקה'));
    check(20, 'ולוחם סדיר מופיע באימון של צוות א׳', await has('דוד בדיקה'));
  }

  // ── 21. every screen renders ──
  for (const [i, path] of [
    ['21', '/schedule'],
    ['22', '/trainings'],
    ['23', '/teams'],
    ['24', '/logistics'],
    ['25', '/calendar'],
    ['26', '/archive'],
    ['27', '/manage'],
    ['28', '/profile'],
    ['29', '/install'],
    ['30', '/my'],
    ['31', '/chat'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
    await settle(900);
    const body = await text();
    const broke = body.includes('Application error') || body.trim().length < 40;
    check(Number(i), `${path} נטען`, !broke, broke ? 'הדף ריק או קרס' : '');
  }

  // ── 32. the audit log recorded what happened ──
  await page.goto(`${BASE}/manage`, { waitUntil: 'networkidle' });
  await settle(1500);
  const manageBody = await text();
  check(32, 'יומן הפעולות רשם את הוספת הלוחם', manageBody.includes('דוד בדיקה'));
  check(33, 'מסך הניהול מציג תקופות, דו״חות וגיבוי', manageBody.includes('גיבוי מלא'));

  // ── 34. no console errors anywhere ──
  const real = consoleErrors.filter(
    (e) => !/favicon|manifest|sw\.js|Failed to load resource: net::ERR_CONNECTION/i.test(e),
  );
  const badResponses = failedRequests.filter((r) => !/favicon|manifest|sw\.js/.test(r));
  check(
    34,
    'אין שגיאות בקונסולה בכל המסכים',
    real.length === 0,
    [...new Set(badResponses)].slice(0, 6).join(' | ') || real.slice(0, 3).join(' | '),
  );
} catch (e) {
  bad(99, 'הריצה נעצרה', e.message);
} finally {
  console.log(`\nעברו: ${pass}   נכשלו: ${fail}`);
  if (problems.length) console.log('\nכשלים:\n  ' + problems.join('\n  '));
  await browser.close();
  process.exit(fail ? 1 : 0);
}
