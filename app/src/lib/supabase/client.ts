'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The unit decided the code is required on every entry — no "remember me" — so
 * the session lives in sessionStorage: it survives a reload but not closing the
 * tab, and it never touches a cookie.
 */
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'חסרה הגדרת Supabase — הוסף NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY לקובץ .env.local',
    );
  }
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: typeof window === 'undefined' ? undefined : window.sessionStorage,
      storageKey: 'hapak300.session',
    },
  });
  return client;
}

/**
 * Calls one of this app's own server routes. The login flow lives there rather
 * than in the browser because it needs the service-role key to read `pin_hash`
 * — the code and the hash never reach the client.
 */
export async function callServer<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: 'שגיאת רשת — בדוק את החיבור' }));
  if (!res.ok) throw new Error(data.error || 'הפעולה נכשלה');
  return data as T;
}
