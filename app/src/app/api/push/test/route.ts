import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { admin, anon, withinRate } from '@/lib/server/admin';

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

  if (!(await withinRate(db, `pushtest:${personId}`, 10, 600)))
    return NextResponse.json(
      { error: 'נשלחו יותר מדי בדיקות. נסה שוב בעוד כמה דקות.' },
      { status: 429 },
    );

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

  const results: { device: string; ok: boolean; error?: string }[] = [];

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      results.push({ device: deviceOf(s.endpoint), ok: true });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      const body = (err as { body?: string }).body;
      // 404/410 means the browser dropped the subscription — clean it up
      if (status === 404 || status === 410)
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      results.push({
        device: deviceOf(s.endpoint),
        ok: false,
        error:
          status === 404 || status === 410
            ? 'המנוי במכשיר הזה פג — הפעל את ההתראות שוב במכשיר עצמו'
            : `שירות הדחיפה החזיר ${status ?? '?'}${body ? ` · ${String(body).slice(0, 120)}` : ''}`,
      });
    }
  }

  return NextResponse.json({ sent: results.filter((r) => r.ok).length, results });
}

/**
 * Which phone this subscription belongs to, from the push service it uses.
 * When one device gets the notification and another does not, this is what
 * turns "it does not work" into "Apple rejected the iPhone's subscription".
 */
function deviceOf(endpoint: string): string {
  if (endpoint.includes('push.apple.com')) return 'אייפון';
  if (endpoint.includes('fcm.googleapis.com') || endpoint.includes('android.googleapis.com'))
    return 'אנדרואיד / Chrome';
  if (endpoint.includes('mozilla.com') || endpoint.includes('mozaws')) return 'Firefox';
  if (endpoint.includes('notify.windows.com')) return 'Windows / Edge';
  return 'דפדפן';
}
