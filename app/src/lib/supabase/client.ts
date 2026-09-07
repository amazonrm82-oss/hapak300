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

export const functionsUrl = (name: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;

/** Calls an Edge Function with the anon key; used by the login screens. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const res = await fetch(functionsUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: 'שגיאת רשת' }));
  if (!res.ok) throw new Error(data.error || 'הפעולה נכשלה');
  return data as T;
}
