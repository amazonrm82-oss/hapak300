import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { admin, anon } from '@/lib/server/admin';

/**
 * Sends a test push to the caller's own devices, and only to those.
 *
 * A fighter who has just turned notifications on has no way to know whether the
 * chain actually works until the first reminder is due — possibly a week later.
 * This proves it in one tap. The caller is identified from their own access
 * token, so nobody can push to anyone else.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey)
    return NextResponse.json(
      { error: 'התראות פוש לא מוגדרות בשרת — חסרים מפתחות VAPID.' },
      { status: 500 },
    );

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });

  const { data: auth, error: authError } = await anon().auth.getUser(token);
  const personId = auth?.user?.app_metadata?.person_id as string | undefined;
  if (authError || !personId)
    return NextResponse.json({ error: 'ההתחברות פגה — היכנס מחדש' }, { status: 401 });

  const db = admin();
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('person_id', personId);

  if (!subs?.length) return NextResponse.json({ sent: 0 });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:admin@hapak300.local',
    publicKey,
    privateKey,
  );

  const payload = JSON.stringify({
    title: 'כשירות חפ״ק מח״ט 300',
    body: 'בדיקת התראות — הכול עובד. תזכורות האימונים יגיעו לכאן.',
    url: '/schedule',
    tag: 'hapak-test',
  });

  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (err) {
      // 404/410 means the browser dropped the subscription — clean it up
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410)
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }

  return NextResponse.json({ sent });
}
