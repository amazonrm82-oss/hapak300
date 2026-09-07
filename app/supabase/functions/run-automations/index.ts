/**
 * Runs every 10 minutes (pg_cron → this function).
 *
 * A direct port of `runAutomations` from the prototype's hapak-core.js:
 *   · evening reminder the day before, at the configured hour (18:00)
 *   · morning reminder two hours before the departure
 *   · "waiting to be summarised" for a training that has passed
 *   · an invitation with no answer past the 48-hour window
 *   · a personal certification expiring within 30 days
 *
 * Each fires exactly once — `reminders_sent` holds one row per event. The same
 * pass then delivers Web Push for any notification not yet pushed, honouring
 * each person's notification preferences.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import webpush from 'https://esm.sh/web-push@3.6.7';

const TZ = 'Asia/Jerusalem';

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const today = fmtDate(new Date());
  const now = fmtTime(new Date());

  const created = await createReminders(db, today, now);
  const pushed = await deliverPush(db);

  return new Response(JSON.stringify({ ok: true, today, now, created, pushed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// ── reminders ──────────────────────────────────────────────────────────────

async function createReminders(db: SupabaseClient, today: string, now: string): Promise<number> {
  const { data: settings } = await db.from('settings').select('*').single();
  if (!settings) return 0;

  const { data: sentRows } = await db.from('reminders_sent').select('key');
  const sent = new Set((sentRows ?? []).map((r: { key: string }) => r.key));

  const { data: people } = await db.from('people').select('*').eq('status', 'active');
  const { data: teams } = await db.from('teams').select('*');
  const { data: topics } = await db.from('topics').select('id, name');
  const { data: trainings } = await db
    .from('trainings_view')
    .select('*')
    .not('status', 'in', '(cancelled,done)');

  const roster = people ?? [];
  const topicName = (id: string) => topics?.find((t) => t.id === id)?.name ?? '';
  const leaders = roster.filter((p) => p.is_admin || p.is_hapak_commander).map((p) => p.id);

  const participantsOf = (t: Record<string, unknown>) =>
    roster
      .filter((p) => p.team_id && (t.team_id === 'joint' || p.team_id === t.team_id))
      .map((p) => p.id);

  const leadersOf = (t: Record<string, unknown>) => {
    const teamCmd = teams?.find((x) => x.id === t.team_id)?.commander_id;
    return [...new Set([t.commander_id as string, teamCmd, ...leaders].filter(Boolean))] as string[];
  };

  const tomorrow = addDays(today, 1);
  const queue: { key: string; text: string; to: string[]; tid: string | null; kind: string }[] = [];

  for (const t of trainings ?? []) {
    const ids = [...new Set([...participantsOf(t), t.instructor_id, t.commander_id].filter(Boolean))] as string[];
    const label = `${t.team_id === 'joint' ? 'משותף' : `אימון ${pad(t.seq)}`} · ${topicName(t.topic_id)}`;

    // evening before, from the configured hour
    if (t.date === tomorrow && now >= (settings.evening_reminder || '18:00') && !sent.has(`${t.id}:eve`))
      queue.push({
        key: `${t.id}:eve`,
        text: `תזכורת: מחר ${label} · יציאה ${t.departure} מ${t.pickup} · ${t.location}`,
        to: ids,
        tid: t.id,
        kind: 'evening',
      });

    // two hours before the departure, on the day itself
    const morningFrom = addMinutes(t.departure, -(settings.morning_reminder_before || 120));
    if (t.date === today && now >= morningFrom && now < t.departure && !sent.has(`${t.id}:morn`))
      queue.push({
        key: `${t.id}:morn`,
        text: `היום: ${label} · יציאה ${t.departure} מ${t.pickup}`,
        to: ids,
        tid: t.id,
        kind: 'morning',
      });

    // the training has passed without a summary
    if (t.date < today && !sent.has(`${t.id}:sum`))
      queue.push({
        key: `${t.id}:sum`,
        text: `${label} (${t.date}) הסתיים — ממתין לסיכום מפקד האימון ולאישור נוכחות סופי.`,
        to: leadersOf(t),
        tid: t.id,
        kind: 'general',
      });

    // an invitation with no answer past the window
    const hours = settings.invite_hours || 48;
    for (const role of ['instructor', 'commander'] as const) {
      const status = role === 'instructor' ? t.inst_status : t.cmd_status;
      const at = role === 'instructor' ? t.inst_invited_at : t.cmd_invited_at;
      const who = role === 'instructor' ? t.instructor_id : t.commander_id;
      if (status !== 'pending' || !at || !who) continue;
      if (Date.now() - new Date(at).getTime() <= hours * 3600_000) continue;
      const key = `${t.id}:${role}:over:${who}`;
      if (sent.has(key)) continue;
      queue.push({
        key,
        text: `הזמנת ${role === 'instructor' ? 'המדריך' : 'מפקד האימון'} ל${label} ללא מענה מעל ${hours} שעות — מומלץ להזמין מחליף.`,
        to: leadersOf(t),
        tid: t.id,
        kind: 'general',
      });
    }
  }

  // certifications expiring, or already expired
  const CERTS: [string, string][] = [
    ['fire', 'ירי (מטווח שנתי)'],
    ['drive', 'נהיגה מבצעית'],
    ['medic', 'עזרה ראשונה'],
    ['comms', 'קשר / שו״ב'],
    ['mildrive', 'נהג רכב צבאי'],
    ['medical', 'בדיקות רפואיות'],
  ];
  const alertDays = settings.cert_alert_days || 30;

  for (const p of roster) {
    for (const [key, label] of CERTS) {
      const expires = (p.certs ?? {})[key];
      if (!expires) continue;
      const days = daysBetween(today, expires);
      if (days > alertDays) continue;
      const k = `cert:${p.id}:${key}:${expires}`;
      if (sent.has(k)) continue;
      queue.push({
        key: k,
        text: `הסמכה: ${p.rank} ${p.name} — ${label} ${days < 0 ? 'פקעה' : 'פוקעת'} ב-${expires}`,
        to: [...new Set([p.id, ...leaders])],
        tid: null,
        kind: 'general',
      });
    }
  }

  for (const item of queue) {
    // the primary key on reminders_sent is what actually guarantees "once"
    const { error } = await db.from('reminders_sent').insert({ key: item.key });
    if (error) continue; // already sent by a concurrent run
    await db
      .from('notifications')
      .insert({ text: item.text, to: item.to, training_id: item.tid, kind: item.kind });
  }

  return queue.length;
}

// ── web push ───────────────────────────────────────────────────────────────

async function deliverPush(db: SupabaseClient): Promise<number> {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@hapak300.local';
  if (!publicKey || !privateKey) return 0;

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const { data: pending } = await db
    .from('notifications')
    .select('*')
    .is('pushed_at', null)
    .order('time', { ascending: true })
    .limit(100);

  if (!pending?.length) return 0;

  const { data: subs } = await db.from('push_subscriptions').select('*');
  const { data: people } = await db.from('people').select('id, notif');
  const prefs = new Map((people ?? []).map((p) => [p.id, p.notif ?? {}]));

  let sent = 0;

  for (const n of pending) {
    const recipients: string[] = n.to ?? (people ?? []).map((p) => p.id);

    for (const personId of recipients) {
      // the recipient's own preference decides whether this kind reaches them
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

// ── small date helpers, in Israel time ─────────────────────────────────────

const pad = (n: number | string) => String(n).padStart(2, '0');

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
