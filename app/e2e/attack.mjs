/**
 * What each role can reach when nobody is holding the screen.
 *
 * The role matrix checks that the app does not *offer* someone a thing. This
 * checks that they cannot *take* it: it signs in the way the app does, then
 * talks to the database API directly with that person's own token, the way a
 * curious fighter with the browser console open would.
 *
 * A hidden button is not a permission. Everything here should be refused by the
 * database itself, and the point of the file is to prove that with each real
 * token rather than with a policy read.
 *
 *     node e2e/attack.mjs http://localhost:3210 http://localhost:54321 <anon-key>
 */
const APP = process.argv[2] ?? 'http://localhost:3210';
const SB = process.argv[3] ?? 'http://localhost:54321';
const ANON = process.argv[4] ?? 'e2e-anon-key';

let pass = 0;
let fail = 0;
const problems = [];
const ok = (l) => (pass++, console.log(`  ✅ ${l}`));
const bad = (l, d = '') => (fail++, problems.push(`${l}${d ? ` — ${d}` : ''}`), console.log(`  ❌ ${l}${d ? ` — ${d}` : ''}`));

/** Signs in exactly as the app does and returns the access token. */
async function signIn(pn, pin) {
  const r1 = await fetch(`${APP}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pn, pin }),
  });
  const body = await r1.json();
  return body.access_token ?? null;
}

const api = (token) => ({
  async get(path) {
    const r = await fetch(`${SB}/rest/v1/${path}`, {
      headers: { apikey: ANON, authorization: `Bearer ${token}` },
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  },
  async patch(path, patch) {
    // deliberately no `return=representation`: asking for the row back needs
    // SELECT on every column, which most roles do not have — the request would
    // then fail for a reason that has nothing to do with the write. Whether the
    // write landed is decided by reading the value back, below.
    const r = await fetch(`${SB}/rest/v1/${path}`, {
      method: 'PATCH',
      headers: { apikey: ANON, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  },
  async post(path, row) {
    // no `return=representation`, for the same reason as the patch above and
    // because it is what the app itself sends: an outsider filing a join
    // request may write it, and may not read anything back
    const r = await fetch(`${SB}/rest/v1/${path}`, {
      method: 'POST',
      headers: { apikey: ANON, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(row),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  },
});

/** A write that changed nothing, or was refused, is a refusal either way. */
const refused = (res) => res.status >= 400 || (Array.isArray(res.body) && res.body.length === 0);

/**
 * Did that write actually land?
 *
 * The only honest answer for a row-level rule: read the value, try the write,
 * read it again. A refusal and a write that matched no rows look identical from
 * the response, and both are refusals — what matters is whether the value moved.
 */
async function moved(client, name, col, value) {
  const read = async () =>
    (await client.get(`people_view?select=${col}&name=eq.${encodeURIComponent(name)}`)).body?.[0]?.[col];
  const before = await read();
  await client.patch(`people?name=eq.${encodeURIComponent(name)}`, { [col]: value });
  return (await read()) !== before;
}

console.log('\n── מה אפשר לקחת דרך ה-API, בלי המסך ──');

// ── the plain fighter ──
const fighter = await signIn('7654321', '5297');
if (!fighter) {
  bad('הלוחם נכנס דרך ה-API', 'ההתחברות נכשלה — שאר הבדיקות לא ירוצו');
} else {
  ok('הלוחם נכנס דרך ה-API (כמו שהאפליקציה עושה)');
  const f = api(fighter);

  const people = await f.get('people_view?select=name,pn,weapon_serial,nvg_serial');
  const others = (people.body ?? []).filter((p) => p.name !== 'דוד בדיקה');
  bad_or_ok('לוחם אינו מקבל מספרים אישיים של אחרים', others.every((p) => !p.pn));
  bad_or_ok('ולא צ׳ של נשק או אמר״ל', others.every((p) => !p.weapon_serial && !p.nvg_serial));

  // the raw table, not the view — the view is not the wall, the grant is
  const raw = await f.get('people?select=pn,pin_hash');
  bad_or_ok('הטבלה עצמה חסומה לקריאה ישירה', raw.status >= 400, `status ${raw.status}`);

  bad_or_ok('לוחם אינו ממנה את עצמו למנהל', !(await moved(f, 'דוד בדיקה', 'is_admin', true)));
  bad_or_ok('ואינו משנה נשק של אחר', !(await moved(f, 'רון קצין', 'weapon', 'נגב')));
  bad_or_ok(
    'ואינו מוסיף רכב למאגר',
    refused(await f.post('fleet', { type: 'האמר', tz: '1111111', seats: 5 })),
  );
  bad_or_ok(
    'ואינו מסדר לעצמו השלמה',
    refused(await f.post('training_guests', { training_id: (await f.get('trainings_view?select=id&limit=1')).body?.[0]?.id, person_id: (await f.get('people_view?select=id&name=eq.דוד בדיקה')).body?.[0]?.id })),
  );
  bad_or_ok('ואינו קורא את יומן הפעולות', refused(await f.get('audit_log?select=id&limit=1')));
}

// ── the sergeant ──
const sgt = await signIn('7654324', '4739');
if (sgt) {
  const s = api(sgt);
  ok('סמל צוות נכנס דרך ה-API');
  bad_or_ok('סמל צוות אינו משנה שם של לוחם', !(await moved(s, 'רון קצין', 'rank', 'רס״ן')));
  bad_or_ok(
    'ואינו נוגע במאגר הרכבים',
    refused(await s.post('fleet', { type: 'זאב', tz: '2222222', seats: 5 })),
  );
  bad_or_ok('אבל כן מעדכן אמר״ל — זה התפקיד שלו', await moved(s, 'רון קצין', 'nvg', 'אמר״ל 1×'));
}

// ── the team commander ──
const cmd = await signIn('7654323', '6284');
if (cmd) {
  const c = api(cmd);
  ok('מפקד צוות נכנס דרך ה-API');
  bad_or_ok(
    'מפקד צוות אינו ממנה מפקד צוות',
    !(await moved(c, 'דוד בדיקה', 'is_team_commander', true)),
  );
  bad_or_ok('ואינו ממנה מדריך', !(await moved(c, 'דוד בדיקה', 'is_instructor', true)));
  bad_or_ok('אבל כן עורך את הצוות שלו', await moved(c, 'שי סמל', 'phone', '052-1112223'));
}

// ── with no token at all: the public key alone, as it ships in the bundle ──
const anon = api('');
bad_or_ok('בלי התחברות אין גישה לשמות', refused(await anon.get('people_view?select=name')));
bad_or_ok('ולא לטלפונים', refused(await anon.get('people_view?select=phone')));
bad_or_ok('ולא ללו״ז האימונים', refused(await anon.get('trainings_view?select=date,location')));
bad_or_ok('ולא להגדרות היחידה', refused(await anon.get('settings?select=unit_name')));
bad_or_ok('ולא לצוותים', refused(await anon.get('teams?select=name')));
// the one thing an outsider is meant to be able to do
const join = await anon.post('join_requests', {
  name: 'בודק חיצוני', pn: '7000098', rank: 'טוראי', role: 'מאבטח', team_id: 'a', phone: '050',
});
bad_or_ok('אבל כן יכול לבקש להצטרף', join.status < 400, `status ${join.status}`);

// ── the endpoints the app itself exposes ──
const cron = await fetch(`${APP}/api/cron`);
bad_or_ok('מסלול התזמון דורש סוד', cron.status === 401 || cron.status === 500, `status ${cron.status}`);

const flush = await fetch(`${APP}/api/push/flush`, { method: 'POST' });
bad_or_ok('דחיפת התראות דורשת התחברות', flush.status === 401, `status ${flush.status}`);

const health = await (await fetch(`${APP}/api/health`)).json();
bad_or_ok(
  'בדיקת התקינות אומרת איזו גרסה רצה',
  !!health.build?.commit && !!health.build?.branch,
  JSON.stringify(health.build ?? null),
);
bad_or_ok(
  'בדיקת התקינות אינה מפרסמת את גודל היחידה',
  typeof health.people_count !== 'number' || health.people_count === 0,
  `people_count=${health.people_count}`,
);

function bad_or_ok(label, cond, detail) {
  return cond ? ok(label) : bad(label, detail);
}

console.log(`\nעברו: ${pass}   נכשלו: ${fail}`);
if (problems.length) console.log('\nכשלים:\n  ' + problems.join('\n  '));
process.exit(fail ? 1 : 0);
