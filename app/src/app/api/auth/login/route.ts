import { NextResponse } from 'next/server';
import {
  admin,
  clearFailures,
  lockoutMessage,
  mintSession,
  recordFailure,
} from '@/lib/server/admin';
import { verifyPin } from '@/lib/server/pin';

/**
 * POST { pn, pin? } → a Supabase session, or `{ stage: 'set-pin' }` on first login.
 *
 * Only someone an administrator or the HQ-party commander has already added to
 * `people` can get in; a pending join request grants nothing. This runs on the
 * server because it needs the service-role key to read `pin_hash` — the hash
 * never leaves this route, and neither does the PIN.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { pn?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const pn = String(body.pn ?? '').trim();
  const pin = String(body.pin ?? '').trim();
  if (!/^\d{7}$/.test(pn))
    return NextResponse.json({ error: 'מספר אישי חייב להיות 7 ספרות' }, { status: 400 });

  let db;
  try {
    db = admin();
  } catch {
    return NextResponse.json(
      { error: 'השרת אינו מוגדר — חסר SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 },
    );
  }

  const locked = await lockoutMessage(db, pn);
  if (locked) return NextResponse.json({ error: locked }, { status: 429 });

  const { data: person } = await db
    .from('people')
    .select('id, name, rank, status, pin_hash')
    .eq('pn', pn)
    .maybeSingle();

  if (!person) {
    const { data: settings } = await db.from('settings').select('allow_join').maybeSingle();
    await recordFailure(db, pn);
    return NextResponse.json(
      {
        error: settings?.allow_join
          ? 'המספר האישי לא רשום במערכת. רק מי שנוסף על ידי מנהל המערכת או מפקד החפ״ק יכול להיכנס — אפשר לשלוח בקשת הצטרפות.'
          : 'המספר האישי לא רשום במערכת — פנה למנהל המערכת או למפקד החפ״ק כדי שיוסיפו אותך.',
      },
      { status: 401 },
    );
  }

  if (person.status !== 'active')
    return NextResponse.json({ error: 'המשתמש מושבת זמנית — פנה למנהל המערכת.' }, { status: 403 });

  const who = `${person.rank} ${person.name}`;

  // first login: no code chosen yet
  if (!person.pin_hash) return NextResponse.json({ stage: 'set-pin', name: who });

  // the personal number checked out; now ask for the code
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ stage: 'pin', name: who });

  if (!(await verifyPin(pin, person.pin_hash))) {
    await recordFailure(db, pn);
    return NextResponse.json(
      { error: 'קוד שגוי. שכחת? מנהל המערכת או מפקד החפ״ק יכולים לאפס אותו.' },
      { status: 401 },
    );
  }

  await clearFailures(db, pn);
  const session = await mintSession(db, person.id, pn);
  return session
    ? NextResponse.json({ stage: 'ok', ...session })
    : NextResponse.json({ error: 'יצירת ההתחברות נכשלה' }, { status: 500 });
}
