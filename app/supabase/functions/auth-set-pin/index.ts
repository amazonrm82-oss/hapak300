/**
 * POST { pn, pin, pin2 } → sets the code on first login (or after a reset) and
 * returns a session. Refuses if a code is already set: changing one goes
 * through the administrator, who clears it first.
 */
import { CORS, admin, anon, clearFailures, fail, json } from '../_shared/common.ts';
import { authPassword, hashPin, isWeakPin, syntheticEmail } from '../_shared/pin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('method not allowed', 405);

  let body: { pn?: string; pin?: string; pin2?: string };
  try {
    body = await req.json();
  } catch {
    return fail('בקשה לא תקינה');
  }

  const pn = String(body.pn ?? '').trim();
  const pin = String(body.pin ?? '').trim();
  const pin2 = String(body.pin2 ?? '').trim();

  if (!/^\d{7}$/.test(pn)) return fail('מספר אישי חייב להיות 7 ספרות');
  if (!/^\d{4}$/.test(pin)) return fail('הקוד חייב להיות 4 ספרות');
  if (pin !== pin2) return fail('שני הקודים אינם זהים');
  if (isWeakPin(pin)) return fail('בחר קוד פחות צפוי (לא 1234 ולא ספרה חוזרת)');

  const db = admin();
  const { data: person } = await db
    .from('people')
    .select('id, status, pin_hash')
    .eq('pn', pn)
    .maybeSingle();

  if (!person) return fail('המספר האישי לא רשום במערכת', 401);
  if (person.status !== 'active') return fail('המשתמש מושבת זמנית — פנה למנהל המערכת.', 403);
  if (person.pin_hash)
    return fail('כבר נבחר קוד למשתמש זה. לאיפוס — פנה למנהל המערכת או למפקד החפ״ק.', 409);

  await db
    .from('people')
    .update({ pin_hash: await hashPin(pin), pin_set_at: new Date().toISOString() })
    .eq('id', person.id);
  await clearFailures(db, pn);

  const email = syntheticEmail(pn);
  const password = await authPassword(person.id);

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { person_id: person.id },
  });

  if (createErr) {
    // the auth user may already exist from an earlier code that was reset
    const { data: existing } = await db
      .from('people')
      .select('auth_id')
      .eq('id', person.id)
      .maybeSingle();
    if (existing?.auth_id) await db.auth.admin.updateUserById(existing.auth_id, { password, email });
    else return fail('יצירת המשתמש נכשלה', 500);
  } else if (created?.user) {
    await db.from('people').update({ auth_id: created.user.id }).eq('id', person.id);
  }

  const { data, error } = await anon().auth.signInWithPassword({ email, password });
  if (error || !data.session) return fail('ההתחברות נכשלה', 500);

  return json({
    stage: 'ok',
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
  });
});
