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
let step = 0;
const problems = [];

// checks number themselves in the order they run, so inserting one in the
// middle does not renumber every check after it
const n = () => String(++step).padStart(2, '0');

const ok = (label) => {
  pass++;
  console.log(`✅  ${n()}  ${label}`);
};
const bad = (label, detail = '') => {
  fail++;
  const at = n();
  problems.push(`${at} ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`❌  ${at}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const check = (label, cond, detail) => (cond ? ok(label) : bad(label, detail));

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

/**
 * The attendance tab, addressed by its own label.
 *
 * "נוכחות" on its own also matches the "סימון נוכחות" button above the tabs,
 * which opens a dialog instead of switching tabs — the tab carries a count.
 */
const attendanceTab = async () => {
  await page.locator('button').filter({ hasText: /^נוכחות \d+\/\d+$/ }).first().click();
  await page.waitForTimeout(700);
};

/** Clicks the first button whose label contains `label`. */
async function click(label, nth = 0) {
  await page.locator(`button:has-text("${label}"), a:has-text("${label}")`).nth(nth).click();
  await settle();
}

try {
  // ── the login screen ──
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  check('מסך הכניסה נטען', await has('מספר אישי'));

  // ── an unknown personal number is refused ──
  await page.fill('input', '9999999');
  await refused(async () => {
    await click('המשך');
    await settle(900);
  });
  check('מספר אישי לא רשום נדחה', await has('לא רשום'));

  // ── the administrator's first login asks for a code, without naming them ──
  await page.reload({ waitUntil: 'networkidle' });
  await page.fill('input', '8409505');
  await click('המשך');
  await settle(900);
  const body3 = await text();
  check('מספר אישי מוכר עובר לשלב הקוד', body3.includes('קוד'));
  check('ולא חושף שם או דרגה לפני אימות', !body3.includes('מתן זזון'));

  // ── choosing a code, and the weak-code rule ──
  const pins = await page.locator('input[type="password"]');
  await pins.nth(0).fill('1234');
  if ((await pins.count()) > 1) await pins.nth(1).fill('1234');
  await refused(async () => {
    await click('שמור קוד');
    await settle(900);
  });
  check('קוד חלש (1234) נדחה', await has('פחות צפוי'));

  const pins2 = await page.locator('input[type="password"]');
  await pins2.nth(0).fill('8317');
  if ((await pins2.count()) > 1) await pins2.nth(1).fill('8317');
  await click('שמור קוד');
  await page.waitForURL(/\/(schedule|my)/, { timeout: 15000 }).catch(() => {});
  await settle(1500);
  check('כניסה ראשונה מצליחה ונכנסים ללו״ז', page.url().includes('/schedule'));

  // ── the code was actually stored: sign out, sign back in with it ──
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await settle();
  await click('יציאה');
  await settle(1200);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input', '8409505');
  await click('המשך');
  await settle(900);
  const askedAgain = await has('כניסה ראשונה');
  check('הכניסה השנייה מבקשת רק את הקוד, לא בחירה מחדש', !askedAgain);

  await page.locator('input[type="password"]').first().fill('8317');
  await click('כניסה');
  await page.waitForURL(/\/schedule/, { timeout: 15000 }).catch(() => {});
  await settle(1500);
  check('כניסה עם הקוד שנבחר מצליחה', page.url().includes('/schedule'));

  // ── the roster, and adding a fighter to סדיר ──
  await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
  await settle(1200);
  const teamsBody = await text();
  check('מסך הצוותים מציג את שלושת הצוותים', teamsBody.includes('סדיר'));

  // the quick-add row is a set of labelled fields, so address them by label
  const byLabel = (label) =>
    page.locator(`.field:has(label:text-is("${label}")) input, .field:has(label:text-is("${label}")) select`).first();
  const inDialog = (label) =>
    page
      .locator('[role="dialog"]')
      .locator(`.field:has(label:text-is("${label}")) input, .field:has(label:text-is("${label}")) select`)
      .first();
  await byLabel('שם מלא').fill('דוד בדיקה');
  await byLabel('מספר אישי').fill('7654321');
  // pick סדיר in the team selector of the quick-add row
  await byLabel('צוות').selectOption('c');
  await click('הוסף');
  await settle(1500);
  check('הוספת לוחם לצוות סדיר', await has('דוד בדיקה'));

  // the roles the unit actually has, including the two newest
  const roleOptions = (await byLabel('תפקיד').locator('option').allInnerTexts()).join(' | ');
  check('רס״פ וסמל צוות מופיעים ברשימת התפקידים', roleOptions.includes('רס״פ') && roleOptions.includes('סמל צוות'));

  // A second fighter, added through the full form because only there can he be
  // marked an instructor — and only a marked instructor may be named instructor
  // of a training. He carries one of the new roles too, so the round trip of
  // that field through the database is checked.
  await click('הוספת לוחם');
  await settle(900);
  await inDialog('שם מלא').fill('אבי מדריך');
  await inDialog('מספר אישי (7 ספרות)').fill('7654322');
  await inDialog('תפקיד בכוח').selectOption('סמל צוות');
  await inDialog('צוות').selectOption('a');
  await page.locator('label:has-text("ניתן להזמין להדרכה") input[type="checkbox"]').check();
  await click('שמירה');
  await settle(1800);
  check('ותפקיד חדש נשמר ומוצג ברשימת הכוח', await has('סמל צוות'));

  // and an officer holding no command post, to check that the commission alone
  // qualifies him to command a training
  await byLabel('שם מלא').fill('רון קצין');
  await byLabel('מספר אישי').fill('7654323');
  await byLabel('דרגה').selectOption('סרן');
  await byLabel('צוות').selectOption('a');
  await click('הוסף');
  await settle(1500);

  // a סמל צוות, whose rights come from the post rather than a permission box
  await byLabel('שם מלא').fill('שי סמל');
  await byLabel('מספר אישי').fill('7654324');
  await byLabel('תפקיד').selectOption('סמל צוות');
  await byLabel('צוות').selectOption('a');
  await click('הוסף');
  await settle(1500);

  // ── creating a training with logistics ──
  // the create button lives on the schedule, next to the week it would fall in
  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await settle(1200);
  await click('אימון חדש');
  await settle(900);
  const dialog = await has('נושא');
  check('טופס אימון חדש נפתח', dialog);

  const today = new Date();
  const future = new Date(today.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  await page.locator('input[type="date"]').first().fill(future);
  const times = page.locator('input[type="time"]');
  await times.nth(0).fill('07:00');
  await times.nth(1).fill('17:00');
  await page.locator('input[list="hapak-locs"]').fill('שטח אימונים בדיקה');

  // Commander and instructor are mandatory before it will publish. Neither is
  // the plain fighter, on purpose: an instructor may record the results of the
  // station he ran, so making him one would hand him exactly the permissions
  // the checks at the end are meant to prove he does not have.
  const pickPerson = async (fieldLabel, nameFragment) => {
    const select = byLabel(fieldLabel);
    const value = await select
      .locator('option')
      .filter({ hasText: nameFragment })
      .first()
      .getAttribute('value');
    await select.selectOption(value);
  };
  // who each list offers: instructing takes the flag, and commanding a training
  // takes a team commander and above — a commission on its own is not enough
  const optionsOf = async (fieldLabel) =>
    byLabel(fieldLabel).locator('option').allInnerTexts();
  const instructorNames = (await optionsOf('מדריך')).join(' | ');
  const commanderNames = (await optionsOf('מפקד אימון')).join(' | ');
  check(
    'רק מוסמך מוצע כמדריך',
    instructorNames.includes('אבי מדריך') && !instructorNames.includes('רון קצין'),
  );
  check('וקצין ללא תפקיד פיקודי אינו מוצע כמפקד אימון', !commanderNames.includes('רון קצין'));

  await pickPerson('מפקד אימון', 'זזון');
  await pickPerson('מדריך', 'אבי מדריך');

  const modeOptions = (await byLabel('סוג האימון').locator('option').allInnerTexts()).join(' | ');
  check(
    'אפשר לבחור אימון רטוב, חלקי או יבש',
    modeOptions.includes('רטוב') && modeOptions.includes('חלקי') && modeOptions.includes('יבש'),
  );

  // nothing is chosen for him: the sections are there, empty, and the proposal
  // is a button he presses if he wants it
  check('הלוגיסטיקה מופיעה בטופס', await has('ציוד נדרש'));
  check('ובתוכה מזון ומים ותחמושת', (await has('מזון ומים')) && (await has('תחמושת')));
  // every row in the kit lists carries a ✕; with nothing chosen there are none
  const kitRows = () => page.locator('[role="dialog"] button[aria-label="הסרת שורה"]').count();
  check('ואין שום דבר שנבחר מראש', (await kitRows()) === 0);
  await click('מלא הצעה לפי הנושא');
  await settle(1000);
  check('וכפתור ההצעה ממלא אותן למי שרוצה', (await kitRows()) > 0);

  await click('שמירה ופרסום');
  await settle(2500);
  const created = page.url().includes('/trainings/');
  check('האימון נוצר ונפתח', created);

  let trainingUrl = null;
  if (created) {
    trainingUrl = page.url();
    check('מסך האימון מציג לשונית מקצים', await has('מקצים'));

    // Only a fighter marked present or late is measured, so the commander marks
    // the force first — the same order the day actually happens in.
    await attendanceTab();
    await settle(1000);
    const davidRow = page.locator('tbody tr').filter({ hasText: 'דוד בדיקה' }).first();
    await davidRow.locator('button:has-text("עדכון")').click();
    await settle(800);
    // one tap is the whole answer: picking ״מגיע״ saves and closes the dialog
    await page.locator('button:text-is("מגיע")').first().click();
    await settle(2000);
    check('המפקד סימן את הלוחם כנוכח', (await davidRow.innerText()).includes('מגיע'));
    check('והחלון נסגר על אותה לחיצה', (await page.locator('[role="dialog"]').count()) === 0);

    // ── drills ──
    await click('מקצים');
    await settle(900);
    await click('הוספת מקצה');
    await settle(600);
    await page.locator('input[placeholder*="ירי בעמידה"]').fill('ירי בעמידה');
    await page.locator('input[placeholder="20"]').fill('20');
    await page.locator('textarea').first().fill('20 כדורים, 5 מטרות, 50 מ׳');
    await click('הוסף מקצה');
    await settle(1500);
    check('מקצה נוסף לאימון', await has('ירי בעמידה'));

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
      check('הציון מחושב מהפגיעות (17/20 = 85)', (await row.innerText()).includes('85.0'));
    } else {
      bad('הציון מחושב מהפגיעות', 'לא נמצאו שדות קלט בשורת הלוחם');
    }

    // ── the commander's grade for the training ──
    await byLabel('ציון המפקד לאימון (0–100)').fill('88');
    await click('שמור ציון');
    await settle(1500);
    check('ציון המפקד לאימון נשמר', await has('88'));

    // ── attendance ──
    await page.goto(trainingUrl, { waitUntil: 'networkidle' });
    await settle(1200);
    await attendanceTab();
    await settle(1000);
    check('לשונית הנוכחות מציגה את הכוח', await has('דוד בדיקה'));
    check('ולוחם סדיר מופיע באימון של צוות א׳', await has('דוד בדיקה'));
  }

  // ── every screen renders ──
  for (const path of [
    '/schedule',
    '/trainings',
    '/teams',
    '/logistics',
    '/calendar',
    '/archive',
    '/manage',
    '/profile',
    '/install',
    '/my',
    '/chat',
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
    await settle(900);
    const body = await text();
    const broke = body.includes('Application error') || body.trim().length < 40;
    check(`${path} נטען`, !broke, broke ? 'הדף ריק או קרס' : '');
  }

  // ── promote the officer to team commander, for the checks further down ──
  // Done while the administrator is still signed in, and after the checks above
  // that depend on him holding no command post. He is the senior rank in צוות
  // א׳, so his is the first card on the roster.
  await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
  await settle(1200);
  await click('עריכה');
  await settle(900);
  // the name lives in an input, so it is read as a value rather than as text
  check('כרטיס הלוחם נפתח לעריכה', (await inDialog('שם מלא').inputValue()) === 'רון קצין');
  await page.locator('label:has-text("מאשר נוכחות סופית") input[type="checkbox"]').check();
  await click('שמירה');
  await settle(1800);

  // ── the print view has a way back out of it ──
  //
  // It opens as a bare document with no address bar and no back button of its
  // own; in the installed app that left the schedule print as a dead end.
  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await settle(1200);
  const [printView] = await Promise.all([
    page.context().waitForEvent('page'),
    click('הדפסת לו״ז'),
  ]);
  await printView.waitForLoadState('domcontentloaded').catch(() => {});
  await printView.waitForTimeout(800);
  const printBody = await printView.locator('body').innerText();
  check('מסך ההדפסה מציג את הלו״ז', printBody.includes('לו״ז אימונים'));
  check('ויש בו קישור חזרה למערכת', printBody.includes('חזרה למערכת'));
  await printView.locator('a:has-text("חזרה למערכת")').click();
  await printView.waitForTimeout(1500);
  check('שמחזיר לאפליקציה', printView.url().includes('/schedule'));
  await printView.close();

  // ── the audit log recorded what happened ──
  await page.goto(`${BASE}/manage`, { waitUntil: 'networkidle' });
  await settle(1500);
  const manageBody = await text();
  check('יומן הפעולות רשם את הוספת הלוחם', manageBody.includes('דוד בדיקה'));
  check('מסך הניהול מציג תקופות, דו״חות וגיבוי', manageBody.includes('גיבוי מלא'));

  // ── no console errors anywhere ──
  const real = consoleErrors.filter(
    (e) => !/favicon|manifest|sw\.js|Failed to load resource: net::ERR_CONNECTION/i.test(e),
  );
  // ── the same app, entered as a plain fighter ──
  //
  // Everything up to here was done as the administrator, who is allowed
  // everything — which proves nothing about what anyone else can reach. This
  // signs in as the fighter added in step 10 and checks the walls from inside:
  // the database refuses him (the SQL suite proves that), and the screens must
  // not offer him what the database would refuse.
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await settle();
  await click('יציאה');
  await settle(1200);

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input', '7654321');
  await click('המשך');
  await settle(900);
  const fighterPins = page.locator('input[type="password"]');
  await fighterPins.nth(0).fill('5297');
  if ((await fighterPins.count()) > 1) await fighterPins.nth(1).fill('5297');
  await click('שמור קוד');
  await page.waitForURL(/\/(schedule|my)/, { timeout: 15000 }).catch(() => {});
  await settle(1500);
  check('לוחם רגיל נכנס למערכת בקוד שבחר', !page.url().includes('/login'));

  // his commander already marked him, so there is nothing left to ask him
  check('ואינו נשאל שוב על אימון שכבר סומן עבורו', !(await has('נקבע לך אימון')));

  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await settle(1200);
  const canCreate = await page.locator('button:has-text("אימון חדש")').count();
  check('ואין לו כפתור ליצירת אימון', canCreate === 0);

  await page.goto(`${BASE}/manage`, { waitUntil: 'networkidle' });
  await settle(1200);
  check('מסך הניהול חסום בפניו', await has('ניהול התקופה שמור'));
  check('ויומן הפעולות אינו נגלה לו', !(await has('יומן פעולות')));

  await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
  await settle(1200);
  const teamsAsFighter = await text();
  check('אינו רואה מספר אישי של אחר', !teamsAsFighter.includes('8409505'));

  if (trainingUrl) {
    await page.goto(trainingUrl, { waitUntil: 'networkidle' });
    await settle(1200);
    await click('מקצים');
    await settle(1000);
    check('אין לו תיבת ציון לאימון', (await page.locator('button:has-text("שמור ציון")').count()) === 0);

    await page.locator('button:has-text("ירי בעמידה")').first().click();
    await settle(900);
    const drillTable = page.locator('table').first();
    const tableText = await drillTable.innerText();
    check('רואה במקצה רק את עצמו',
      tableText.includes('דוד בדיקה') && !tableText.includes('אבי מדריך'),
    );
    const editable = await drillTable.locator('input:not([disabled])').count();
    check('ואינו יכול לשנות תוצאות', editable === 0);
  }

  // ── and the סמל צוות, whose rights come from his post ──
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await settle();
  await click('יציאה');
  await settle(1200);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input', '7654324');
  await click('המשך');
  await settle(900);
  const sgtPins = page.locator('input[type="password"]');
  await sgtPins.nth(0).fill('4739');
  if ((await sgtPins.count()) > 1) await sgtPins.nth(1).fill('4739');
  await click('שמור קוד');
  await page.waitForURL(/\/(schedule|my)/, { timeout: 15000 }).catch(() => {});
  await settle(1500);
  check('סמל צוות נכנס למערכת', !page.url().includes('/login'));

  // nobody has answered for him, and a training was published to his team —
  // so the app asks on the way in, which is the point of the prompt
  check('והמערכת שואלת אותו אם הוא מגיע לאימון', await has('נקבע לך אימון'));
  await page.locator('button:text-is("מגיע")').first().click();
  await settle(1800);
  check('ותשובתו נשמרת', !(await has('נקבע לך אימון')));

  // and it is his answer once: changing it is his commander's to do
  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await settle(1500);
  check(
    'ואין לו יותר כפתור לשנות אותה',
    (await page.locator('button:has-text("עדכון נוכחות")').count()) === 0,
  );

  await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
  await settle(1500);
  check('ואין לו כפתור עריכה מלאה', (await page.locator('button:has-text("עריכה")').count()) === 0);
  const kitButtons = page.locator('button:has-text("נשק והכשרות")');
  check('אלא רק נשק והכשרות', (await kitButtons.count()) > 0);

  await kitButtons.first().click();
  await settle(900);
  await page.locator('input[placeholder="הצ׳ של הנשק"]').fill('5512345');
  await page.locator('input[placeholder="סוג האמר״ל"]').fill('אמר״ל 4×');
  await page.locator('input[placeholder="הצ׳ של האמר״ל"]').fill('7788990');
  await click('שמירה');
  await settle(2000);
  await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
  await settle(1500);
  await kitButtons.first().click();
  await settle(900);
  const savedSerial = await page.locator('input[placeholder="הצ׳ של הנשק"]').inputValue();
  const savedNvg = await page.locator('input[placeholder="הצ׳ של האמר״ל"]').inputValue();
  check('ומספר הנשק שרשם נשמר וחזר', savedSerial === '5512345');
  check('וגם האמר״ל', savedNvg === '7788990');
  await page.locator('button[aria-label="סגירה"], button:has-text("✕")').first().click();
  await settle(600);

  await click('דו״ח צל״ם');
  await settle(1200);
  const kitReport = await page.locator('[role="dialog"] textarea').inputValue();
  check('ומוציא דו״ח צל״ם לצוות שלו', kitReport.includes('7788990') && kitReport.includes('אמר״ל'));
  check(
    'שאין בו דו״ח של כל היחידה',
    (await page.locator('button:has-text("דו״ח צל״ם — כל היחידה")').count()) === 0,
  );
  await page.locator('button[aria-label="סגירה"]').first().click();
  await settle(600);

  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await settle(1200);
  check('ואינו יוצר אימונים', (await page.locator('button:has-text("אימון חדש")').count()) === 0);

  // ── and the team commander, over his own team ──
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await settle();
  await click('יציאה');
  await settle(1200);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input', '7654323');
  await click('המשך');
  await settle(900);
  const cmdPins = page.locator('input[type="password"]');
  await cmdPins.nth(0).fill('6284');
  if ((await cmdPins.count()) > 1) await cmdPins.nth(1).fill('6284');
  await click('שמור קוד');
  await page.waitForURL(/\/(schedule|my)/, { timeout: 15000 }).catch(() => {});
  await settle(1500);
  if (await has('נקבע לך אימון')) {
    await page.locator('button:text-is("מגיע")').first().click();
    await settle(1500);
  }
  check('מפקד צוות נכנס למערכת', !page.url().includes('/login'));

  await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
  await settle(1500);
  check('ורואה עריכה מלאה על הצוות שלו', (await page.locator('button:has-text("עריכה")').count()) > 0);

  await click('עריכה');
  await settle(1000);
  const card = page.locator('[role="dialog"]');
  const cardText = await card.innerText();
  check(
    'אך אינו יכול למנות מפקד צוות או מדריך',
    !cardText.includes('מאשר נוכחות סופית') && !cardText.includes('ניתן להזמין להדרכה'),
  );
  check('ונאמר לו במפורש למה', cardText.includes('שמור למפקד החפ״ק ולמנהל המערכת'));

  // and the editing itself works
  await inDialog('טלפון').fill('052-7654321');
  await click('שמירה');
  await settle(1800);
  check('והעריכה עצמה נשמרת', await has('052-7654321'));

  const badResponses = failedRequests.filter((r) => !/favicon|manifest|sw\.js/.test(r));
  check('אין שגיאות בקונסולה בכל המסכים',
    real.length === 0,
    [...new Set(badResponses)].slice(0, 6).join(' | ') || real.slice(0, 3).join(' | '),
  );
} catch (e) {
  bad('הריצה נעצרה', e.message);
} finally {
  console.log(`\nעברו: ${pass}   נכשלו: ${fail}`);
  if (problems.length) console.log('\nכשלים:\n  ' + problems.join('\n  '));
  await browser.close();
  process.exit(fail ? 1 : 0);
}
