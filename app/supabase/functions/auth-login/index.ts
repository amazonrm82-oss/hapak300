/**
 * POST { pn, pin? } → a Supabase session, or `{ stage: 'set-pin' }` on first login.
 *
 * Only someone the administrator or the HQ-party commander has already added to
 * `people` can get in. A pending join request grants nothing.
 */
import {
  CORS,
  admin,
  anon,
  clearFailures,
  fail,
  json,
  lockoutMessage,
  recordFailure,
} from '../_shared/common.ts';
import { authPassword, syntheticEmail, verifyPin } from '../_shared/pin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('method not allowed', 405);

  let body: { pn?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return fail('בקשה לא תקינה');
  }

  const pn = String(body.pn ?? '').trim();
  const pin = String(body.pin ?? '').trim();
  if (!/^\d{7}$/.test(pn)) return fail('מספר אישי חייב להיות 7 ספרות');

  const db = admin();

  const locked = await lockoutMessage(db, pn);
  if (locked) return fail(locked, 429);

  const { data: person } = await db
    .from('people')
    .select('id, pn, name, rank, status, pin_hash')
    .eq('pn', pn)
    .maybeSingle();

  if (!person) {
    const { data: settings } = await db.from('settings').select('allow_join').maybeSingle();
    await recordFailure(db, pn);
    return fail(
      settings?.allow_join
        ? 'המספר האישי לא רשום במערכת. רק מי שנוסף על ידי מנהל המערכת או מפקד החפ״ק יכול להיכנס — אפשר לשלוח בקשת הצטרפות.'
        : 'המספר האישי לא רשום במערכת — פנה למנהל המערכת או למפקד החפ״ק כדי שיוסיפו אותך.',
      401,
    );
  }

  if (person.status !== 'active') return fail('המשתמש מושבת זמנית — פנה למנהל המערכת.', 403);

  // first login: the fighter has not chosen a code yet
  if (!person.pin_hash) {
    return json({ stage: 'set-pin', name: `${person.rank} ${person.name}` });
  }

  if (!/^\d{4}$/.test(pin)) {
    return json({ stage: 'pin', name: `${person.rank} ${person.name}` });
  }

  if (!(await verifyPin(pin, person.pin_hash))) {
    await recordFailure(db, pn);
    return fail('קוד שגוי. שכחת? מנהל המערכת או מפקד החפ״ק יכולים לאפס אותו.', 401);
  }

  await clearFailures(db, pn);
  const session = await mintSession(db, person.id, pn);
  return session ? json({ stage: 'ok', ...session }) : fail('יצירת ההתחברות נכשלה', 500);
});

/**
 * Makes sure the auth user for this person exists and signs it in. The password
 * is derived on the server from the person's id — it is not the PIN, so the PIN
 * never reaches Supabase Auth and never leaves these functions.
 */
async function mintSession(db: ReturnType<typeof admin>, personId: string, pn: string) {
  const email = syntheticEmail(pn);
  const password = await authPassword(personId);

  const { data: person } = await db.from('people').select('auth_id').eq('id', personId).maybeSingle();

  if (person?.auth_id) {
    // keep the derived password current in case the secret was rotated
    await db.auth.admin.updateUserById(person.auth_id, { password, email });
  } else {
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { person_id: personId },
    });
    if (error || !created.user) return null;
    await db.from('people').update({ auth_id: created.user.id }).eq('id', personId);
  }

  const { data, error } = await anon().auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
  };
}
