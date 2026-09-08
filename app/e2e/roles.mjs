/**
 * The same system, seen from five chairs.
 *
 * `flows.mjs` walks one path through the app and proves it works. This walks
 * every screen as every rank and asks a different question: does each person get
 * exactly what their post entitles them to — no more, and no less?
 *
 * "No less" is the half that is easy to lose. A permission rule that is too
 * tight looks like nothing at all: no error, no message, just a commander who
 * cannot do his job and assumes the app is broken. So every role carries a list
 * of what it MUST be offered as well as what it must not, and both are checked.
 *
 * Screenshots are written to e2e/shots/ at phone and desktop widths, for the
 * visual pass that no assertion can do.
 *
 *     node e2e/roles.mjs http://localhost:3210
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3210';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

let pass = 0;
let fail = 0;
const problems = [];
const ok = (l) => (pass++, console.log(`  ✅ ${l}`));
const bad = (l, d = '') => (fail++, problems.push(`${l}${d ? ` — ${d}` : ''}`), console.log(`  ❌ ${l}${d ? ` — ${d}` : ''}`));
const check = (l, cond, d) => (cond ? ok(l) : bad(l, d));

const SCREENS = [
  '/schedule', '/trainings', '/teams', '/logistics',
  '/calendar', '/archive', '/manage', '/profile', '/my', '/chat', '/install',
];

/**
 * The five chairs. `pn` and `pin` are how they get in; `must` is what the app
 * has to offer them somewhere, `mustNot` is what it must never show them.
 */
const ROLES = [
  {
    key: 'admin',
    name: 'מנהל מערכת',
    pn: '8409505',
    pin: '8317',
    must: ['אימון חדש', 'הוספת לוחם', 'דו״ח צל״ם — כל היחידה', 'סגירת תקופה', 'גיבוי מלא'],
    mustNot: [],
    blocked: [],
  },
  {
    key: 'hapak',
    name: 'מפקד חפ״ק',
    pn: '7387250',
    pin: '5194',
    must: ['אימון חדש', 'הוספת לוחם', 'דו״ח צל״ם — כל היחידה'],
    mustNot: [],
    blocked: [],
  },
  {
    key: 'teamcmd',
    name: 'מפקד צוות',
    pn: '7654323',
    pin: '6284',
    must: ['אימון חדש', 'דו״ח צל״ם', 'עריכה'],
    mustNot: ['הוספת לוחם'],
    blocked: ['/manage'],
  },
  {
    key: 'sergeant',
    name: 'סמל צוות',
    pn: '7654324',
    pin: '4739',
    must: ['נשק והכשרות', 'דו״ח צל״ם'],
    mustNot: ['אימון חדש', 'הוספת לוחם', 'דו״ח צל״ם — כל היחידה'],
    blocked: ['/manage'],
  },
  {
    key: 'fighter',
    name: 'לוחם',
    pn: '7654321',
    pin: '5297',
    must: [],
    mustNot: ['אימון חדש', 'הוספת לוחם', 'עריכה', 'דו״ח צל״ם'],
    blocked: ['/manage'],
  },
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  headless: false,
  args: ['--headless=new', '--no-sandbox'],
});

const report = [];

for (const role of ROLES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const failed = [];
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  // a reset connection produces a console line with no response behind it, so
  // the URL only shows up here — without it the report says "something failed"
  const dropped = [];
  page.on('requestfailed', (r) => dropped.push(`${r.failure()?.errorText ?? '?'} ${r.url()}`));

  console.log(`\n── ${role.name} (${role.pn}) ──`);

  // ── in ──
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input', role.pn);
  await page.locator('button:has-text("המשך")').first().click();
  // the button says ״רגע…״ while the request is in flight; clicking the next
  // one before it comes back is a race the test loses, not the app
  await page.locator('button:has-text("רגע…")').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  const pins = page.locator('input[type="password"]');
  await pins.nth(0).fill(role.pin);
  if ((await pins.count()) > 1) await pins.nth(1).fill(role.pin);
  await page
    .locator('button:has-text("שמור קוד"), button:has-text("כניסה")')
    .first()
    .click({ timeout: 20000 });
  await page.waitForURL(/\/(schedule|my)/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // the entry prompt, if this training is still unanswered for him
  if ((await page.locator('body').innerText()).includes('נקבע לך אימון')) {
    await page.locator('button:text-is("מגיע")').first().click();
    await page.waitForTimeout(1800);
  }

  check(`${role.name} נכנס למערכת`, !page.url().includes('/login'), page.url());

  // ── every screen, and what it offers him ──
  const seen = new Set();
  for (const path of SCREENS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(700);
    const body = await page.locator('body').innerText();
    const broke = body.includes('Application error') || body.trim().length < 40;
    if (broke) bad(`${role.name}: ${path} נטען`, 'הדף ריק או קרס');

    for (const b of await page.locator('button, a').allInnerTexts()) seen.add(b.trim());

    if (role.blocked.includes(path))
      check(
        `${role.name}: ${path} חסום`,
        body.includes('שמור למנהל') || body.includes('שמור למפקד') || !body.includes('גיבוי מלא'),
      );

    // one screenshot per role per width, on the roster — the busiest screen
    if (path === '/teams') {
      await page.screenshot({ path: `${SHOTS}${role.key}-teams-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOTS}${role.key}-teams-phone.png`, fullPage: true });
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.waitForTimeout(400);
    }
  }

  const labels = [...seen].join(' | ');
  for (const m of role.must)
    check(`${role.name} מקבל ״${m}״`, labels.includes(m), 'לא הוצע לו בשום מסך');
  for (const m of role.mustNot)
    check(`${role.name} אינו מקבל ״${m}״`, !labels.includes(m), 'הוצע לו והיה אמור להיחסם');

  // "Failed to load resource" says nothing on its own — the same event is in
  // `failed` or `dropped` with the URL attached, and that is where it is judged.
  const realErrors = errors.filter(
    (e) => !/favicon|manifest|sw\.js/i.test(e) && !/Failed to load resource/i.test(e),
  );
  check(`${role.name}: אין שגיאות בקונסולה`, realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  const realFailed = failed.filter((f) => !/favicon|manifest|sw\.js/i.test(f));
  check(`${role.name}: אין בקשות שנכשלו`, realFailed.length === 0, realFailed.slice(0, 2).join(' | '));

  // A prefetch the browser cancels because we navigated away is not a fault:
  // it lands as ERR_ABORTED on an `?_rsc=` URL and nothing on screen is missing.
  const realDropped = [...new Set(dropped)].filter(
    (d) => !(/_rsc=/.test(d) && /ERR_ABORTED/.test(d)) && !/favicon|manifest|sw\.js/i.test(d),
  );
  check(`${role.name}: ואין בקשה שנפלה באמצע`, realDropped.length === 0, realDropped.slice(0, 2).join(' | '));

  report.push({ role: role.name, offered: [...seen].filter(Boolean).sort() });
  await ctx.close();
}

writeFileSync(`${SHOTS}offered.json`, JSON.stringify(report, null, 2));
console.log(`\nעברו: ${pass}   נכשלו: ${fail}`);
if (problems.length) console.log('\nכשלים:\n  ' + problems.join('\n  '));
await browser.close();
process.exit(fail ? 1 : 0);
