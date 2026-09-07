import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export const fail = (error: string, status = 400) => json({ error }, status);

/** Full-privilege client. Never hand this to the browser. */
export function admin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Anon client — used only to mint a session once credentials have checked out. */
export function anon(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

/** Returns a Hebrew message when the account is locked out, otherwise null. */
export async function lockoutMessage(db: SupabaseClient, pn: string): Promise<string | null> {
  const { data } = await db.from('login_attempts').select('*').eq('pn', pn).maybeSingle();
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
