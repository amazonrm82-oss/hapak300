import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { authPassword, syntheticEmail } from './pin';

/**
 * Server-only Supabase clients.
 *
 * `admin()` holds the service-role key and bypasses every policy — it exists so
 * the login routes can read `pin_hash` and mint sessions. It must never be
 * imported into anything that reaches the browser; the key lives in
 * `SUPABASE_SERVICE_ROLE_KEY`, which has no `NEXT_PUBLIC_` prefix precisely so
 * Next.js refuses to bundle it client-side.
 */
export function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('חסרות הגדרות Supabase בשרת');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Anon client — used only to mint a session once credentials have checked out. */
export function anon(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('חסרות הגדרות Supabase בשרת');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

/**
 * Who is calling, as well as we can tell behind Vercel's proxy. Only ever used
 * as a rate-limit key — never stored with anything that identifies a person.
 */
export function callerKey(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for') ?? '';
  const ip = fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
  return ip.slice(0, 64);
}

/**
 * True while the caller is still inside their allowance for `key`.
 *
 * Fails open on a database error: a rate limiter that locks everyone out when
 * it breaks is worse than the abuse it prevents, and the per-account lock is
 * still in place underneath.
 */
export async function withinRate(
  db: SupabaseClient,
  key: string,
  maxHits: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await db.rpc('bump_rate_limit', {
    k: key,
    max_hits: maxHits,
    window_seconds: windowSeconds,
  });
  if (error) {
    console.error('rate limit check failed:', error.message);
    return true;
  }
  return data !== false;
}

/** A Hebrew message while the account is locked out, otherwise null. */
export async function lockoutMessage(db: SupabaseClient, pn: string): Promise<string | null> {
  const { data } = await db.from('login_attempts').select('locked_until').eq('pn', pn).maybeSingle();
  if (!data?.locked_until) return null;
  const until = new Date(data.locked_until).getTime();
  if (until <= Date.now()) return null;
  const mins = Math.ceil((until - Date.now()) / 60000);
  return `יותר מדי ניסיונות. נסה שוב בעוד ${mins} דקות, או פנה למנהל המערכת לאיפוס הקוד.`;
}

export async function recordFailure(db: SupabaseClient, pn: string): Promise<void> {
  const { data } = await db.from('login_attempts').select('failures').eq('pn', pn).maybeSingle();
  const failures = (data?.failures ?? 0) + 1;
  await db.from('login_attempts').upsert({
    pn,
    failures,
    last_try: new Date().toISOString(),
    locked_until:
      failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
  });
}

export async function clearFailures(db: SupabaseClient, pn: string): Promise<void> {
  await db.from('login_attempts').delete().eq('pn', pn);
}

/**
 * Ensures the auth user behind a person exists, then signs it in and returns
 * the session tokens for the browser to adopt.
 */
export async function mintSession(db: SupabaseClient, personId: string, pn: string) {
  const email = syntheticEmail(pn);
  const password = authPassword(personId);

  const { data: person } = await db.from('people').select('auth_id').eq('id', personId).maybeSingle();

  if (person?.auth_id) {
    // keeps the derived password current if the secret was ever rotated
    await db.auth.admin.updateUserById(person.auth_id, { password, email });
  } else {
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { person_id: personId },
    });
    if (error || !created.user) return null;
    // without `auth_id` the database cannot tell which fighter the session
    // belongs to, so a session that could not be linked is no session at all
    const { error: linkError } = await db
      .from('people')
      .update({ auth_id: created.user.id })
      .eq('id', personId);
    if (linkError) {
      console.error('mintSession: linking auth_id failed:', linkError);
      return null;
    }
  }

  const { data, error } = await anon().auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
  };
}
