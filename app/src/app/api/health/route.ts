import { NextResponse } from 'next/server';
import { admin } from '@/lib/server/admin';

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

export async function GET() {
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
          people_count: count,
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
      message: `הכול תקין — ${count} אנשים במערכת. אפשר להיכנס.`,
      people_count: count,
      push_devices: subs ?? 0,
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
