import { NextResponse } from 'next/server';
import { admin, anon } from '@/lib/server/admin';
import { vapidSubject } from '@/lib/server/push';

/**
 * Setup diagnostics, in Hebrew.
 *
 * Reports which environment variables are present and whether the service-role
 * key can actually reach the database — the two things that go wrong when the
 * app is first deployed, and which the login screen cannot tell apart on its
 * own. Presence and counts only: no key, name or personal number is returned.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Anyone on the internet can reach this — it has to work before a single
  // person can sign in, which is exactly when it is needed. So it says whether
  // the deployment is configured and whether the roster loaded, but the numbers
  // themselves — how many fighters, how many phones — are only for someone who
  // has signed in. A headcount is not a configuration detail.
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  let insider = false;
  if (token) {
    const { data } = await anon().auth.getUser(token);
    insider = !!data?.user?.app_metadata?.person_id;
  }
  const counted = (n: number) => (insider ? n : n > 0 ? 'יש' : 0);
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    PIN_PEPPER: !!process.env.PIN_PEPPER,
    AUTH_DERIVE_SECRET: !!process.env.AUTH_DERIVE_SECRET,
    CRON_SECRET: !!process.env.CRON_SECRET,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
  };

  // push is optional, so its two keys are reported but never block startup
  const OPTIONAL = ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'];
  const missing = Object.entries(env)
    .filter(([name, present]) => !present && !OPTIONAL.includes(name))
    .map(([name]) => name);

  const push = {
    configured: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY,
    // Apple rejects a token whose subject is not a real address; Google does not
    subject: vapidSubject(),
    note: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
      ? 'התראות פוש מוגדרות'
      : 'התראות פוש לא מוגדרות — הוסף NEXT_PUBLIC_VAPID_PUBLIC_KEY ו-VAPID_PRIVATE_KEY ב-Vercel ועשה Redeploy',
  };

  // The project host, so a URL pointing at the wrong project — or carrying a
  // stray /rest/v1/ path — is visible without exposing any key.
  let projectHost: string | null = null;
  let urlLooksRight = false;
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    projectHost = u.host;
    urlLooksRight = u.pathname === '/' || u.pathname === '';
  } catch {
    /* not a valid URL at all */
  }

  const context = { env, missing, projectHost, urlLooksRight, push };

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        ok: false,
        problem: `חסרים משתני סביבה ב-Vercel: ${missing.join(', ')}`,
        fix: 'Vercel → Settings → Environment Variables → הוסף → ואז Deployments → ⋯ → Redeploy',
        ...context,
      },
      { status: 500 },
    );
  }

  if (!urlLooksRight) {
    return NextResponse.json(
      {
        ok: false,
        problem: 'NEXT_PUBLIC_SUPABASE_URL מכיל נתיב מיותר — הוא צריך להיות הכתובת הבסיסית בלבד.',
        fix: 'הערך הנכון הוא https://<PROJECT>.supabase.co — בלי /rest/v1/ בסוף.',
        ...context,
      },
      { status: 500 },
    );
  }

  try {
    const db = admin();
    const { count, error } = await db.from('people').select('id', { count: 'exact', head: true });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          problem: 'המפתח SUPABASE_SERVICE_ROLE_KEY אינו תקין, או שייך לפרויקט אחר.',
          fix: 'Supabase → Project Settings → API → ליד service_role: Reveal ואז Copy. הדבק מחדש ב-Vercel ועשה Redeploy.',
          db_error: error.message,
          ...context,
        },
        { status: 500 },
      );
    }

    if (!count) {
      return NextResponse.json(
        {
          ok: false,
          problem: 'החיבור תקין, אבל טבלת people ריקה — נתוני הפתיחה לא נטענו.',
          fix: 'הרץ את supabase/setup.sql ב-SQL Editor של Supabase.',
          people_count: 0,
          ...context,
        },
        { status: 500 },
      );
    }

    if (!env.PIN_PEPPER || !env.AUTH_DERIVE_SECRET) {
      return NextResponse.json(
        {
          ok: false,
          problem: `החיבור תקין, אבל חסרים סודות הכניסה: ${missing.join(', ')}`,
          fix: 'Vercel → Settings → Environment Variables → הוסף → Redeploy',
          people_count: counted(count ?? 0),
          ...context,
        },
        { status: 500 },
      );
    }

    const { count: subs } = await db
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true });

    return NextResponse.json({
      ok: true,
      message: insider
        ? `הכול תקין — ${count} אנשים במערכת. אפשר להיכנס.`
        : 'הכול תקין — יש לוחמים במערכת. אפשר להיכנס.',
      people_count: counted(count ?? 0),
      push_devices: counted(subs ?? 0),
      ...context,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        problem: 'החיבור ל-Supabase נכשל.',
        detail: e instanceof Error ? e.message : String(e),
        ...context,
      },
      { status: 500 },
    );
  }
}
