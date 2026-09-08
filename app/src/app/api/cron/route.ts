import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin } from '@/lib/server/admin';
import { deliverPending } from '@/lib/server/push';

/**
 * The reminders, run on a schedule (pg_cron in Supabase calls this route every
 * ten minutes — see supabase/setup.sql).
 *
 * A direct port of `runAutomations` from the prototype's hapak-core.js:
 *   · evening reminder the day before, at the configured hour (18:00)
 *   · morning reminder two hours before the departure
 *   · "waiting to be summarised" for a training that has passed
 *   · an invitation with no answer past the 48-hour window
 *   · a personal certification expiring within 30 days
 *
 * Each fires exactly once — `reminders_sent` holds one row per event, and its
 * primary key is what actually guarantees it. The same pass then delivers Web
 * Push for anything not yet pushed, honouring each person's preferences.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TZ = 'Asia/Jerusalem';

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}

async function run(request: Request) {
  // the caller is a scheduler, not a person: a shared secret is the whole check
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });

  const auth = request.headers.get('authorization') ?? '';
  const provided = auth.replace(/^Bearer\s+/i, '').trim();
  if (!sameSecret(provided, secret))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = admin();
  const now = new Date();
  const today = fmtDate(now);
  const clock = fmtTime(now);

  const created = await createReminders(db, today, clock);
  const pushed = await deliverPending(db);
  const backup = await weeklyBackup(db, now, today);

  return NextResponse.json({ ok: true, today, now: clock, created, pushed, backup });
}

/** Constant-time comparison, so a wrong guess reveals nothing by how long it took. */
function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

// ── reminders ──────────────────────────────────────────────────────────────

interface Queued {
  key: string;
  text: string;
  to: string[];
  tid: string | null;
  kind: string;
}

async function createReminders(db: SupabaseClient, today: string, now: string): Promise<number> {
  const { data: settings } = await db.from('settings').select('*').maybeSingle();
  if (!settings) return 0;

  const { data: sentRows } = await db.from('reminders_sent').select('key');
  const sent = new Set((sentRows ?? []).map((r: { key: string }) => r.key));

  const [{ data: people }, { data: teams }, { data: topics }, { data: trainings }] =
    await Promise.all([
      db.from('people').select('*').eq('status', 'active'),
      db.from('teams').select('*'),
      db.from('topics').select('id, name'),
      db.from('trainings_view').select('*').not('status', 'in', '(cancelled,done)'),
    ]);

  const roster = people ?? [];
  const topicName = (id: string) => topics?.find((t) => t.id === id)?.name ?? '';
  const leaders = roster.filter((p) => p.is_admin || p.is_hapak_commander).map((p) => p.id);

  const participantsOf = (t: Record<string, unknown>) =>
    roster.filter((p) => p.team_id && (t.team_id === 'joint' || p.team_id === t.team_id)).map((p) => p.id);

  const leadersOf = (t: Record<string, unknown>) => {
    const teamCmd = teams?.find((x) => x.id === t.team_id)?.commander_id;
    return [...new Set([t.commander_id as string, teamCmd, ...leaders].filter(Boolean))] as string[];
  };

  const tomorrow = addDays(today, 1);
  const queue: Queued[] = [];

  for (const t of trainings ?? []) {
    const ids = [
      ...new Set([...participantsOf(t), t.instructor_id, t.commander_id].filter(Boolean)),
    ] as string[];
    const label = `${t.team_id === 'joint' ? 'משותף' : `אימון ${pad(t.seq)}`} · ${topicName(t.topic_id)}`;

    if (
      t.date === tomorrow &&
      now >= (settings.evening_reminder || '18:00') &&
      !sent.has(`${t.id}:eve`)
    )
      queue.push({
        key: `${t.id}:eve`,
        text: `תזכורת: מחר ${label} · יציאה ${t.departure} מ${t.pickup} · ${t.location}`,
        to: ids,
        tid: t.id,
        kind: 'evening',
      });

    const morningFrom = addMinutes(t.departure, -(settings.morning_reminder_before || 120));
    if (t.date === today && now >= morningFrom && now < t.departure && !sent.has(`${t.id}:morn`))
      queue.push({
        key: `${t.id}:morn`,
        text: `היום: ${label} · יציאה ${t.departure} מ${t.pickup}`,
        to: ids,
        tid: t.id,
        kind: 'morning',
      });

    if (t.date < today && !sent.has(`${t.id}:sum`))
      queue.push({
        key: `${t.id}:sum`,
        text: `${label} (${t.date}) הסתיים — ממתין לסיכום מפקד האימון ולאישור נוכחות סופי.`,
        to: leadersOf(t),
        tid: t.id,
        kind: 'general',
      });

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

  let created = 0;
  for (const item of queue) {
    const { error } = await db.from('reminders_sent').insert({ key: item.key });
    if (error) continue; // a concurrent run already claimed it
    await db
      .from('notifications')
      .insert({ text: item.text, to: item.to, training_id: item.tid, kind: item.kind });
    created++;
  }
  return created;
}

// ── web push ───────────────────────────────────────────────────────────────

// ── the weekly backup ──────────────────────────────────────────────────────

/**
 * A copy of the whole unit, written once a week into a private bucket.
 *
 * A hosted database is not a backup — a wrong delete or a closed project takes
 * everything with it, and the manual export only exists if somebody remembers
 * to press it. This one does not need remembering. Only the leadership can read
 * the bucket, and the four most recent copies are kept.
 */
async function weeklyBackup(db: SupabaseClient, now: Date, today: string): Promise<string> {
  // Sunday, in the quiet hour before the day starts
  const israel = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  if (israel.getDay() !== 0 || israel.getHours() !== 3) return 'לא היום';

  const name = `hapak300-${today}.json`;
  const { data: existing } = await db.storage.from('backups').list('', { search: name });
  if (existing?.some((f) => f.name === name)) return 'כבר קיים';

  const tables = [
    'settings', 'teams', 'topics', 'people', 'trainings', 'day_blocks', 'attendance',
    'gear_items', 'vehicles', 'ammo', 'food', 'chat_messages', 'feedback', 'photos',
    'calendar_events', 'fleet', 'periods', 'gear_catalog', 'vehicle_types', 'weapons',
    'locations', 'audit_log',
  ];

  const dump: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    format: 'hapak300-backup-1',
  };
  for (const table of tables) {
    const { data, error } = await db.from(table).select('*');
    if (error) {
      console.error(`backup: ${table} failed:`, error.message);
      return `נכשל על ${table}`;
    }
    dump[table] = data ?? [];
  }

  const { error: upErr } = await db.storage
    .from('backups')
    .upload(name, JSON.stringify(dump), { contentType: 'application/json', upsert: true });
  if (upErr) {
    console.error('backup upload failed:', upErr.message);
    return 'ההעלאה נכשלה';
  }

  // keep the four most recent
  const { data: all } = await db.storage.from('backups').list('', { limit: 100 });
  const stale = (all ?? [])
    .map((f) => f.name)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .slice(0, -4);
  if (stale.length) await db.storage.from('backups').remove(stale);

  return name;
}

// ── small date helpers, in Israel time ─────────────────────────────────────

const pad = (n: number | string) => String(n).padStart(2, '0');

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat('he-IL', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000,
  );
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
