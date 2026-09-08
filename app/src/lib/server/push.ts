import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';

/**
 * The `sub` claim on the VAPID token — who to contact about these pushes.
 *
 * Apple validates it and Google does not, which is why the same keys delivered
 * to Chrome and came back from Apple as `403 BadJwtToken`: the default was
 * `mailto:admin@hapak300.local`, and `.local` is not a domain that exists.
 *
 * So a subject is used only if it is a real `https:` URL or a `mailto:` on a
 * routable domain; otherwise the deployment's own address is used, which is
 * both true and always valid. Nothing for the unit to configure.
 */
const USABLE = (value: string): boolean => {
  const v = value.trim();
  if (v.startsWith('mailto:')) {
    const domain = v.slice(7).split('@')[1] ?? '';
    return domain.includes('.') && !/\.(local|localhost|internal|test|invalid)$/i.test(domain);
  }
  if (!v.startsWith('https://')) return false;
  try {
    const host = new URL(v).hostname;
    return host.includes('.') && !/\.(local|localhost|internal|test|invalid)$/i.test(host);
  } catch {
    return false;
  }
};

export function vapidSubject(): string {
  const configured = process.env.VAPID_SUBJECT ?? '';
  if (USABLE(configured)) return configured.trim();

  // Vercel exposes the deployment's own hostnames
  for (const host of [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]) {
    if (host && USABLE(`https://${host}`)) return `https://${host}`;
  }

  // last resort: the Supabase project, which is always set and always real
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (USABLE(supabase)) return new URL(supabase).origin;

  return 'https://vercel.com';
}

/**
 * Sends every notification that has not gone out to a phone yet.
 *
 * The queue is the notifications table: anything with no `pushed_at` is owed a
 * push. The scheduled job drains it, and so does the app right after a training
 * is published — a training set for tomorrow morning should reach the team's
 * phones now, not at the next tick of the clock.
 *
 * A person's own preferences are honoured per kind, and a subscription the
 * browser has dropped is deleted rather than retried forever.
 */
export async function deliverPending(db: SupabaseClient): Promise<number> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return 0; // push is optional

  webpush.setVapidDetails(vapidSubject(), publicKey, privateKey);

  const { data: pending } = await db
    .from('notifications')
    .select('*')
    .is('pushed_at', null)
    .order('time', { ascending: true })
    .limit(100);
  if (!pending?.length) return 0;

  const [{ data: subs }, { data: people }] = await Promise.all([
    db.from('push_subscriptions').select('*'),
    db.from('people').select('id, notif'),
  ]);
  const prefs = new Map((people ?? []).map((p) => [p.id, p.notif ?? {}]));

  let sent = 0;
  for (const n of pending) {
    const recipients: string[] = n.to ?? (people ?? []).map((p) => p.id);

    for (const personId of recipients) {
      const pref = prefs.get(personId) ?? {};
      if (n.kind === 'evening' && pref.evening === false) continue;
      if (n.kind === 'morning' && pref.morning === false) continue;
      if (n.kind === 'approved' && pref.approved === false) continue;
      if (n.kind === 'changed' && pref.changed === false) continue;

      for (const s of (subs ?? []).filter((x) => x.person_id === personId)) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({
              title: 'כשירות חפ״ק מח״ט 300',
              body: n.text,
              url: n.training_id ? `/trainings/${n.training_id}` : '/schedule',
              tag: n.id,
            }),
          );
          sent++;
        } catch (err) {
          // 404/410 means the browser dropped the subscription — clean it up
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410)
            await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }

    await db.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', n.id);
  }
  return sent;
}
