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

/** A labelled field inside whichever dialog is open. */
const inDialogNow = (label) =>
  page
    .locator('[role="dialog"]')
    .locator(`.field:has(label:text-is("${label}")) input, .field:has(label:text-is("${label}")) select`)
    .first();

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

/**
 * Answers the entry prompt until it stops coming back.
 *
 * More than one training can be open for the same person — the copy made
 * further up is one — and each is asked about in turn. Answering them all is
 * what a fighter does on the way in, and it clears the modal for the checks
 * that follow.
 */
const answerPrompts = async (limit = 4) => {
  for (let i = 0; i < limit && (await has('נקבע לך אימון')); i++) {
    await page.locator('button:text-is("מגיע")').first().click();
    await settle(1800);
  }
};

/**
 * Types a personal number into the login screen.
 *
 * The screen remembers the last number on this device and opens straight at the
 * code, which is the point of ״זכור אותי״ — so signing in as somebody else
 * starts by saying that this is somebody else.
 */
const enterPn = async (pn) => {
  const field = page.locator('input').first();
  if (await field.isDisabled().catch(() => false)) {
    await page.locator('button:has-text("לא אתה")').first().click();
    await settle(700);
  }
  await page.fill('input', pn);
};

/**
 * Clicks the first button whose label contains `label`.
 *
 * Waits out any button that reads ״רגע…״ first: while a request is in flight
 * the login screen replaces its label with that, so the next click has nothing
 * to match and times out — a race in the test, not a fault in the app.
 */
async function click(label, nth = 0) {
  await page
    .locator('button:has-text("רגע…")')
    .waitFor({ state: 'detached', timeout: 20000 })
    .catch(() => {});
  await page.locator(`button:has-text("${label}"), a:has-text("${label}")`).nth(nth).click({ timeout: 20000 });
  await settle();
}

try {
  // ── the login screen ──
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  check('מסך הכניסה נטען', await has('מספר אישי'));

  // ── an unknown personal number is refused ──
  await enterPn('9999999');
  await refused(async () => {
    await click('המשך');
    await settle(900);
  });
  check('מספר אישי לא רשום נדחה', await has('לא רשום'));

  // ── the one door open to someone with no account: asking to join ──
  await page.reload({ waitUntil: 'networkidle' });
  await click('בקשת הצטרפות');
  await settle(900);
  const joinForm = page.locator('[role="dialog"]');
  check('טופס בקשת ההצטרפות נפתח', (await joinForm.count()) > 0);
  await inDialogNow('שם מלא').fill('חיצוני בדיקה');
  await inDialogNow('מספר אישי').fill('7009911');
  await inDialogNow('טלפון').fill('050-0000001');
  await click('שלח בקשה');
  await settle(1800);
  check('והבקשה נשלחת בלי שום התחברות', !(await has('נכשל')) && !(await has('אין לך הרשאה')));

  // ── the administrator's first login asks for a code, without naming them ──
  await page.reload({ waitUntil: 'networkidle' });
  await enterPn('8409505');
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
  // ── ״זכור אותי״: המספר נשמר במכשיר, ונשאר רק הקוד ──
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await settle(2200);
  check('המספר האישי נזכר והמסך פותח ישר בקוד', await has('קוד כניסה'));
  check('ומוצע לצאת מזה בלחיצה', await has('לא אתה'));
  check('והכניסה השנייה אינה מבקשת לבחור קוד מחדש', !(await has('כניסה ראשונה')));

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

    // Now that someone has answered, the alert list is live. Nobody in this
    // unit is marked a driver yet, so the proposal put no vehicle on the
    // training — and with no vehicle, no driver is owed and no guard ever is.
    let body = await page.locator('body').innerText();
    check('רשימת ההתראות פעילה — חסר חובש', body.includes('אין חובש'));
    check('ובלי רכב באימון — אין דרישה לנהג', !body.includes('נהגים מוסמכים'));
    check('ומאבטח אינו נדרש', !body.includes('אין מאבטח'), body.match(/.*מאבטח.*/)?.[0]);

    // ── a vehicle needs a driver, and only a licensed one ──
    //
    // Mark the officer a driver and give him a licence in date; he is then the
    // only name the vehicle row will offer, and the only one the database will
    // accept.
    await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
    await settle(1200);
    await click('עריכה');
    await settle(900);
    const driverBox = page
      .locator('[role="dialog"] label')
      .filter({ hasText: 'נהג — ניתן לשבץ כנהג רכב' })
      .locator('input[type="checkbox"]');
    if (await driverBox.count()) await driverBox.check();
    const nextYear = new Date(today.getTime() + 365 * 864e5).toISOString().slice(0, 10);
    await inDialog('נהיגה מבצעית').fill(nextYear);
    await click('שמירה');
    await settle(2200);
    check('סימון נהג והסמכת נהיגה נשמרו', !(await has('אין לך הרשאה')));

    await page.goto(trainingUrl, { waitUntil: 'networkidle' });
    await settle(1600);
    await click('לוגיסטיקה ותחמושת');
    await settle(1000);
    await page.locator('button').filter({ hasText: /^רכבים \(\d+\)$/ }).first().click();
    await settle(900);

    const addRow = page.locator('div').filter({ has: page.locator('input[placeholder="מספר צ׳"]') }).last();
    await addRow.locator('select').first().selectOption('האמר');
    await addRow.locator('input[placeholder="מספר צ׳"]').fill('6110001');
    const addBtn = page.locator('button:has-text("הוסף רכב")').first();
    check('בלי נהג משובץ אי אפשר להוסיף רכב', await addBtn.isDisabled());

    const driverSel = addRow.locator('select').nth(1);
    const driverOpts = await driverSel.locator('option').allInnerTexts();
    check(
      'ורשימת הנהגים מציעה רק את מי שמוסמך',
      driverOpts.length === 2 && driverOpts.some((o) => o.includes('רון קצין')),
      driverOpts.join(' | '),
    );
    await driverSel.selectOption({ label: driverOpts[1] });
    await settle(400);
    check('ומשנבחר נהג — אפשר להוסיף', !(await addBtn.isDisabled()));
    await addBtn.click();
    await settle(2200);
    // the צ׳ lives in an input, so it is read as a value and not as page text
    check(
      'הרכב נוסף עם הנהג שלו',
      (await page.locator('input.tabnum').evaluateAll((els) =>
        els.some((e) => e.value === '6110001'),
      )) || (await has('6110001')),
    );

    await attendanceTab();
    await settle(1000);
    body = await page.locator('body').innerText();
    check('ועכשיו שיש רכב — נדרש נהג שמגיע', body.includes('נהגים מוסמכים'));

    // ── the evacuation vehicle comes from the fleet ──
    //
    // With no vehicle on the training the picker used to be empty, with nothing
    // saying why. It now offers the unit's fleet, and choosing one puts it on
    // the training as well — so the evacuation vehicle is on the manifest.
    await page.goto(`${BASE}/logistics`, { waitUntil: 'networkidle' });
    await settle(900);
    await click('הוספת רכב');
    await settle(600);
    await page.locator('input[placeholder="612345"]').fill('6120099');
    await click('שמירה');
    await settle(1800);
    check('רכב נוסף לצי הרכבים של היחידה', await has('6120099'));

    await page.goto(trainingUrl, { waitUntil: 'networkidle' });
    await settle(1400);
    const evacPick = page
      .locator('select')
      .filter({ has: page.locator('option:text-is("בחר רכב פינוי")') })
      .first();
    const fromFleet = await evacPick
      .locator('option')
      .evaluateAll((os) => os.find((o) => o.value.startsWith('fleet:'))?.value ?? '');
    check('ורכב הפינוי נבחר מתוך הצי', !!fromFleet, 'הרשימה עדיין ריקה');
    if (fromFleet) {
      await evacPick.selectOption(fromFleet);
      await settle(2200);
      check('ומשנבחר — הוא רשום כרכב הפינוי של האימון', await has('6120099'));
    }

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

    // ── היעדרות: מי שבקורס יורד מהמצבת של אותו יום ──
    //
    // The roster is where this has to show, because the roster is what the
    // reminders, the count and the scores are all made of.
    await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
    await settle(1200);
    // his row is the nearest ancestor div that carries a button of its own
    const rowOf = (name) =>
      page.getByText(name).first().locator('xpath=ancestor::div[.//button][1]');
    await rowOf('דוד בדיקה').locator('button:has-text("עריכה")').first().click();
    await settle(900);
    const away = new Date(today.getTime() + 5 * 864e5).toISOString().slice(0, 10);
    const back = new Date(today.getTime() + 9 * 864e5).toISOString().slice(0, 10);
    const dates = page.locator('[role="dialog"] input[type="date"]');
    await dates.nth(0).fill(away);
    await dates.nth(1).fill(back);
    await click('שמירה');
    await settle(2200);
    check('היעדרות נשמרה ומסומנת ברשימת הכוח', await has('היעדרות'));

    await page.goto(trainingUrl, { waitUntil: 'networkidle' });
    await settle(1600);
    await attendanceTab();
    await settle(1000);
    check(
      'ומי שבהיעדרות יורד מהמצבת של אותו אימון',
      !(await page.locator('tbody tr').filter({ hasText: 'דוד בדיקה' }).count()),
    );

    // and back on it the moment the absence is cleared
    await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
    await settle(1200);
    await rowOf('דוד בדיקה').locator('button:has-text("עריכה")').first().click();
    await settle(900);
    await page.locator('[role="dialog"] input[type="date"]').nth(0).fill('');
    await click('שמירה');
    await settle(2200);
    await page.goto(trainingUrl, { waitUntil: 'networkidle' });
    await settle(1600);
    await attendanceTab();
    await settle(1000);
    check(
      'ומשנמחקה — הוא חוזר למצבת',
      (await page.locator('tbody tr').filter({ hasText: 'דוד בדיקה' }).count()) > 0,
    );

    // ── שכפול אימון ──
    //
    // The same day again on another date: the kit, the schedule and the
    // stations come across, and the results do not.
    await click('שכפול אימון');
    await settle(1200);
    check('טופס השכפול נפתח מלא', await has('הכול הועתק מהאימון הקודם'));
    const copyRows = await page
      .locator('[role="dialog"] button[aria-label="הסרת שורה"]')
      .count();
    check('והציוד והרכבים כבר בתוכו', copyRows > 0, `${copyRows} שורות`);
    await click('שמירה ופרסום');
    await settle(3000);
    check('האימון המשוכפל נוצר', page.url().includes('/trainings/') && page.url() !== trainingUrl);
    await click('מקצים');
    await settle(1200);
    check('והמקצים הועתקו איתו', await has('ירי בעמידה'));
    check('בלי התוצאות של הקודם', !(await has('85.0')));
  }

  // ── מח״ט וסמח״ט: מוזנים ביד, ואחד מכל אחד ──
  //
  // The roles are on the administrator's list because he is the one who enters
  // them; the second one of the same kind is refused outright.
  await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
  await settle(1200);
  const roleOpts = await page
    .locator('.field:has(label:text-is("תפקיד")) select')
    .first()
    .locator('option')
    .allInnerTexts();
  check('מנהל המערכת רואה מח״ט וסמח״ט ברשימת התפקידים', roleOpts.includes('מח״ט'));

  // ── נפ״ק: a screen of its own ──
  //
  // Not part of a training: a convoy is put together on the day, from the
  // fleet and from the whole force, and what comes out is read at the gate.
  await page.goto(`${BASE}/npak`, { waitUntil: 'networkidle' });
  await settle(1400);
  check('מסך הנפ״ק נפתח', await has('נפ״ק חדש'));
  check('והוא מציע רכבים מהצי', await has('מהצי:'));
  await page.locator('button').filter({ hasText: /^\+ .* צ׳ / }).first().click();
  await settle(700);
  const npDriver = page.locator('select[aria-label="נהג"]').first();
  const npOpts = await npDriver.locator('option').allInnerTexts();
  check('ורק נהג מוסמך מוצע', npOpts.length === 2, npOpts.join(' | '));
  await npDriver.selectOption({ label: npOpts[1] });
  await settle(400);
  await page.locator('button').filter({ hasText: 'דוד בדיקה' }).first().click();
  await settle(500);

  // somebody who is not in the system at all still rides in the vehicle
  await click('מי שאינו במערכת');
  await settle(700);
  await page.locator('[role="dialog"] input').nth(0).fill('סמל אורח מיחידה אחרת');
  await page.locator('[role="dialog"] input').nth(1).fill('7009988');
  await page.locator('[role="dialog"] input').nth(2).fill('מאבטח');
  await click('הוסף לרכב');
  await settle(900);
  check('אפשר להוסיף לנפ״ק מי שאינו במערכת', await has('סמל אורח מיחידה אחרת'));

  await click('נפק ושלח בוואטסאפ');
  await settle(2600);
  check('הנפ״ק הוצא ונשמר בארכיון', await has('ארכיון נפ״ק (1)'), await text().then((x) => x.slice(0, 80)));

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
    '/npak',
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
  await enterPn('7654321');
  await click('המשך');
  await settle(900);
  const fighterPins = page.locator('input[type="password"]');
  await fighterPins.nth(0).fill('5297');
  if ((await fighterPins.count()) > 1) await fighterPins.nth(1).fill('5297');
  await click('שמור קוד');
  await page.waitForURL(/\/(schedule|my)/, { timeout: 15000 }).catch(() => {});
  await settle(1500);
  check('לוחם רגיל נכנס למערכת בקוד שבחר', !page.url().includes('/login'));

  // His commander already marked him for the first training, so the entry
  // prompt must not name that date again. It may well ask about the copy made
  // further up — that one nobody has heard from him on.
  const [yy, mm, dd] = future.split('-');
  check(
    'ואינו נשאל שוב על אימון שכבר סומן עבורו',
    !(await has(`${dd}.${mm}.${yy}`)) || !(await has('נקבע לך אימון')),
  );
  // he is still owed an answer on the copy; give it, so nothing covers the
  // screen for the checks below
  await answerPrompts();

  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
  await settle(1200);
  const canCreate = await page.locator('button:has-text("אימון חדש")').count();
  check('ואין לו כפתור ליצירת אימון', canCreate === 0);

  // the two posts at the top of the brigade are not on his list at all
  await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
  await settle(1200);
  check('ואינו רואה מח״ט או סמח״ט ברשימת התפקידים', !(await has('סמח״ט')));

  // ── the serials he signed for are his to keep straight ──
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await settle(1400);
  check('ללוחם יש כפתור לציוד שלו', await has('הציוד שלי'));
  await click('הציוד שלי');
  await settle(900);
  await page.locator('input[placeholder="הצ׳ של הנשק"]').fill('9911223');
  await page.locator('input[placeholder="סוג הכוונת"]').fill('מרס');
  await page.locator('input[placeholder="הצ׳ של הכוונת"]').fill('4455667');
  // read inside the dialog: the profile page behind it lists them too
  check(
    'ואין בו הסמכות — הן של המפקדים',
    !(await page.locator('[role="dialog"]').innerText()).includes('הסמכות אישיות'),
  );
  await click('שמירה');
  await settle(2200);
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await settle(1400);
  await click('הציוד שלי');
  await settle(900);
  check(
    'והצ׳ שרשם נשמר וחזר',
    (await page.locator('input[placeholder="הצ׳ של הנשק"]').inputValue()) === '9911223',
  );
  check(
    'וגם הכוונת',
    (await page.locator('input[placeholder="הצ׳ של הכוונת"]').inputValue()) === '4455667',
  );
  await page.keyboard.press('Escape');
  await settle(600);

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
  await enterPn('7654324');
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
  await answerPrompts();
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
  await page.locator('input[placeholder="סוג הכוונת"]').fill('מפרו לייט');
  await page.locator('input[placeholder="הצ׳ של הכוונת"]').fill('4433221');
  await click('שמירה');
  await settle(2000);
  await page.goto(`${BASE}/teams`, { waitUntil: 'networkidle' });
  await settle(1500);
  await kitButtons.first().click();
  await settle(900);
  const savedSerial = await page.locator('input[placeholder="הצ׳ של הנשק"]').inputValue();
  const savedNvg = await page.locator('input[placeholder="הצ׳ של האמר״ל"]').inputValue();
  const savedSight = await page.locator('input[placeholder="הצ׳ של הכוונת"]').inputValue();
  check('ומספר הנשק שרשם נשמר וחזר', savedSerial === '5512345');
  check('וגם האמר״ל', savedNvg === '7788990');
  check('וגם הכוונת', savedSight === '4433221', savedSight);
  await page.locator('button[aria-label="סגירה"], button:has-text("✕")').first().click();
  await settle(600);

  await click('דו״ח צל״ם');
  await settle(1200);
  const kitReport = await page.locator('[role="dialog"] textarea').inputValue();
  check(
    'ומוציא דו״ח צל״ם לצוות שלו',
    kitReport.includes('7788990') && kitReport.includes('אמר״ל'),
  );
  check('ובתוכו גם הכוונת והצ׳ שלה', kitReport.includes('כוונת') && kitReport.includes('4433221'));
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
  await enterPn('7654323');
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
