import { NextResponse } from 'next/server';
import { admin, callerKey, clearFailures, mintSession, withinRate } from '@/lib/server/admin';
import { hashPin, isWeakPin } from '@/lib/server/pin';

/**
 * POST { pn, pin, pin2 } → sets the code on first login (or after a reset) and
 * returns a session. Refuses if a code is already set: changing one goes through
 * the administrator, who clears it first.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { pn?: string; pin?: string; pin2?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const pn = String(body.pn ?? '').trim();
  const pin = String(body.pin ?? '').trim();
  const pin2 = String(body.pin2 ?? '').trim();

  if (!/^\d{7}$/.test(pn))
    return NextResponse.json({ error: 'מספר אישי חייב להיות 7 ספרות' }, { status: 400 });
  if (!/^\d{4}$/.test(pin))
    return NextResponse.json({ error: 'הקוד חייב להיות 4 ספרות' }, { status: 400 });
  if (pin !== pin2) return NextResponse.json({ error: 'שני הקודים אינם זהים' }, { status: 400 });
  if (isWeakPin(pin))
    return NextResponse.json(
      { error: 'בחר קוד פחות צפוי (לא 1234 ולא ספרה חוזרת)' },
      { status: 400 },
    );

  let db;
  try {
    db = admin();
  } catch {
    return NextResponse.json(
      { error: 'השרת אינו מוגדר — חסר SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 },
    );
  }

  if (!(await withinRate(db, `setpin:${callerKey(request)}`, 15, 3600)))
    return NextResponse.json(
      { error: 'יותר מדי ניסיונות מהמכשיר הזה. נסה שוב בעוד שעה.' },
      { status: 429 },
    );

  const { data: person } = await db
    .from('people')
    .select('id, status, pin_hash')
    .eq('pn', pn)
    .maybeSingle();

  if (!person) return NextResponse.json({ error: 'המספר האישי לא רשום במערכת' }, { status: 401 });
  if (person.status !== 'active')
    return NextResponse.json({ error: 'המשתמש מושבת זמנית — פנה למנהל המערכת.' }, { status: 403 });
  if (person.pin_hash)
    return NextResponse.json(
      { error: 'כבר נבחר קוד למשתמש זה. לאיפוס — פנה למנהל המערכת או למפקד החפ״ק.' },
      { status: 409 },
    );

  // Never sign anyone in on a code that was not stored: that put them back on
  // "choose a code" at every login, which looked like the code was being
  // ignored rather than like a failure.
  const { error: saveError } = await db
    .from('people')
    .update({ pin_hash: await hashPin(pin), pin_set_at: new Date().toISOString() })
    .eq('id', person.id);

  if (saveError) {
    console.error('set-pin save failed:', saveError);
    return NextResponse.json(
      { error: `שמירת הקוד נכשלה — הקוד לא נשמר, אז לא נכניס אותך. פנה למנהל המערכת. (${saveError.message})` },
      { status: 500 },
    );
  }

  // read it back: the write must be visible before a session is issued
  const { data: saved } = await db.from('people').select('pin_hash').eq('id', person.id).maybeSingle();
  if (!saved?.pin_hash)
    return NextResponse.json(
      { error: 'הקוד לא נשמר בבסיס הנתונים. פנה למנהל המערכת — ייתכן שחסר עדכון בבסיס הנתונים.' },
      { status: 500 },
    );

  await clearFailures(db, pn);

  const session = await mintSession(db, person.id, pn);
  return session
    ? NextResponse.json({ stage: 'ok', ...session })
    : NextResponse.json({ error: 'ההתחברות נכשלה' }, { status: 500 });
}
