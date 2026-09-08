import { DEFAULT_FREQ, DEFAULT_PICKUP, DEPARTURE_LEAD_MINUTES } from '@/lib/core/constants';
import { addDays, addMinutes, sundayOf } from '@/lib/core/dates';
import {
  defaultDayBlocks,
  defaultLogistics,
  generateRotation,
  type NewAmmo,
  type NewFood,
  type NewGear,
  type NewVehicle,
} from '@/lib/core/defaults';
import {
  activeTrainings,
  fullName,
  participants,
  personById,
  topicName,
  topicSafety,
  trainingTitle,
} from '@/lib/core/selectors';
import type {
  AttStatus,
  CalendarEvent,
  Db,
  Drill,
  Fitness,
  FleetVehicle,
  InviteRole,
  Person,
  RotationConfig,
  TeamKey,
  TrainingFull,
  TrainingTeam,
} from '@/lib/core/types';
import { supabase } from '@/lib/supabase/client';

const sb = () => supabase();

/**
 * Surfaces the Hebrew message the database raised. `RAISE EXCEPTION` text
 * arrives verbatim, so it is passed straight through; the few constraint
 * violations a person can actually trigger get a sentence they can act on.
 */
function check(error: { message: string; code?: string } | null): void {
  if (!error) return;
  const m = error.message || '';
  if (error.code === '23505' && m.includes('people_pn'))
    throw new Error('מספר אישי כבר קיים במערכת');
  if (error.code === '23505') throw new Error('הרשומה כבר קיימת');
  if (error.code === '42501' || /row-level security/i.test(m))
    throw new Error('אין לך הרשאה לפעולה הזו');
  throw new Error(m || 'הפעולה נכשלה');
}

async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<void> {
  const { error } = await sb().rpc(fn, args);
  check(error);
}

async function notify(text: string, to: string[] | null, trainingId: string | null): Promise<void> {
  await sb().from('notifications').insert({ text, to, training_id: trainingId });
}

/**
 * Asks the server to push whatever is queued, now.
 *
 * The scheduled job drains the same queue on its own clock; this is what makes
 * a training that was just published reach the team's phones straight away. It
 * is best-effort on purpose — a training that saved correctly must not report a
 * failure because a push service was slow.
 */
async function pushNow(): Promise<void> {
  try {
    const { data } = await sb().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch('/api/push/flush', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  } catch {
    /* the reminder job will send it on its next run */
  }
}

const participantIds = (db: Db, t: TrainingFull) => participants(db, t).map((p) => p.id);

/** Team ids that join every training — סדיר, and anything set up like it. */
const attendsAllTeams = (db: Db): string[] =>
  Object.values(db.teams)
    .filter((t) => t.attends_all)
    .map((t) => t.id);

// ── attendance ─────────────────────────────────────────────────────────────

export async function markAttendance(
  tid: string,
  personId: string,
  status: AttStatus,
  reason: string,
): Promise<void> {
  const clean = status === 'coming' ? '' : reason.trim();
  if (status !== 'coming' && status !== 'late' && !clean)
    throw new Error('חובה לציין סיבה כשלא מגיעים');

  const { error } = await sb()
    .from('attendance')
    .upsert(
      {
        training_id: tid,
        person_id: personId,
        status,
        reason: clean,
        marked_at: new Date().toISOString(),
        approved: false,
        approved_by: null,
        auto: false,
      },
      { onConflict: 'training_id,person_id' },
    );
  check(error);
}

export const approveAttendance = (tid: string, personId?: string) =>
  rpc('approve_attendance', { tid, pid: personId ?? null });

export const reopenAttendance = (tid: string, personId?: string) =>
  rpc('reopen_attendance', { tid, pid: personId ?? null });

export const summarizeAttendance = (tid: string) => rpc('summarize_attendance', { tid });

export const setAttendanceRating = (tid: string, personId: string, rating: number | null) =>
  rpc('set_attendance_rating', { tid, pid: personId, score: rating });

/**
 * Attaches a fighter to a training that is not his team's.
 *
 * With `makeupFor` it stands in for a training he missed: he is scored where he
 * actually trained, and the missed one stops counting against him. Without it
 * he is simply lent to the force for the day. Either way it is a commander's
 * call — the database refuses anyone below a team commander.
 */
export async function addGuest(
  trainingId: string,
  personId: string,
  makeupFor: string | null,
  note = '',
): Promise<void> {
  const { error } = await sb()
    .from('training_guests')
    .upsert(
      { training_id: trainingId, person_id: personId, makeup_for: makeupFor, note },
      { onConflict: 'training_id,person_id' },
    );
  check(error);
}

export async function removeGuest(trainingId: string, personId: string): Promise<void> {
  const { error } = await sb()
    .from('training_guests')
    .delete()
    .eq('training_id', trainingId)
    .eq('person_id', personId);
  check(error);
}

// ── trainings ──────────────────────────────────────────────────────────────

export interface TrainingForm {
  topic_id: string;
  new_topic?: string;
  team_id: TrainingTeam;
  date: string;
  start: string;
  end: string;
  location: string;
  coords: string;
  commander_id: string;
  instructor_id: string;
  freq: string;
  pickup: string;
  safety: string;
  notes: string;
  /** Filled in on the create form; when absent the topic defaults are used. */
  gear?: NewGear[];
  vehicles?: NewVehicle[];
  ammo?: NewAmmo[];
  food?: NewFood[];
}

/** Every field the unit made mandatory when publishing a training. */
export function validateTrainingForm(f: TrainingForm): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return 'תאריך לא תקין (YYYY-MM-DD)';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.end))
    return 'שעות לא תקינות (HH:MM)';
  if (!f.location.trim()) return 'נדרש מיקום';
  if (!f.commander_id || !f.instructor_id) return 'נדרשים מפקד אימון ומדריך';
  if (!f.safety.trim()) return 'נדרשות הוראות בטיחות';
  return null;
}

/** Builds the full draft — training plus its default logistics — for `create_trainings`. */
function draftFor(db: Db, o: {
  team_id: TrainingTeam;
  topic_id: string;
  date: string;
  start: string;
  end: string;
  location: string;
  coords?: string;
  instructor_id?: string | null;
  commander_id?: string | null;
  safety?: string;
  freq?: string;
  pickup?: string;
  notes?: string;
  status?: 'planned' | 'published';
  gear?: NewGear[];
  vehicles?: NewVehicle[];
  ammo?: NewAmmo[];
  food?: NewFood[];
}) {
  const departure = addMinutes(o.start, -DEPARTURE_LEAD_MINUTES);
  // What the commander filled in on the form wins; anything they left alone
  // falls back to the proposal computed from the topic and the roster.
  const defaults = defaultLogistics(
    o.topic_id,
    o.team_id,
    o.start,
    db.people,
    o.location,
    attendsAllTeams(db),
    o.date,
  );
  const logi = {
    gear: o.gear ?? defaults.gear,
    vehicles: o.vehicles ?? defaults.vehicles,
    ammo: o.ammo ?? defaults.ammo,
    food: o.food ?? defaults.food,
  };
  return {
    team_id: o.team_id,
    topic_id: o.topic_id,
    date: o.date,
    end_date: '',
    start_time: o.start,
    end_time: o.end,
    location: o.location,
    coords: o.coords ?? '',
    instructor_id: o.instructor_id ?? '',
    commander_id: o.commander_id ?? '',
    status: o.status ?? 'planned',
    freq: o.freq ?? DEFAULT_FREQ,
    safety: o.safety || topicSafety(db, o.topic_id),
    pickup: o.pickup ?? DEFAULT_PICKUP,
    departure,
    notes: o.notes ?? '',
    day_blocks: defaultDayBlocks(o.start, o.end, o.topic_id),
    ...logi,
  };
}

async function ensureTopic(db: Db, f: TrainingForm): Promise<string> {
  if (f.topic_id !== '__new') return f.topic_id;
  const name = (f.new_topic ?? '').trim();
  if (!name) throw new Error('נדרש שם לנושא החדש');
  const id = `tp_${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await sb()
    .from('topics')
    .insert({ id, name, safety: f.safety, sort: db.topics.length + 1 });
  check(error);
  return id;
}

async function ensureLocation(db: Db, location: string): Promise<void> {
  const loc = location.trim();
  if (!loc || db.locations.includes(loc)) return;
  await sb().from('locations').upsert({ name: loc, sort: 0 });
}

export async function createTraining(db: Db, user: Person, f: TrainingForm): Promise<string> {
  const err = validateTrainingForm(f);
  if (err) throw new Error(err);

  const topicId = await ensureTopic(db, f);
  await ensureLocation(db, f.location);

  const draft = draftFor(db, {
    ...f,
    topic_id: topicId,
    location: f.location.trim(),
    status: 'published',
  });

  const { data, error } = await sb().rpc('create_trainings', { drafts: [draft], replace_existing: false });
  check(error);
  const id = (data as string[])?.[0];

  void pushNow();

  // the invitations go out from here so the wording matches the prototype
  [f.instructor_id, f.commander_id]
    .filter((pid) => pid && pid !== user.id)
    .forEach((pid) => {
      void notify(
        `הוזמנת ל${pid === f.instructor_id ? 'הדריך' : 'פקד על'} ${topicName(db, topicId)} (${f.date}). נדרש מענה תוך ${db.settings.invite_hours} שעות.`,
        [pid],
        id,
      );
    });

  return id;
}

export async function updateTraining(db: Db, t: TrainingFull, f: TrainingForm): Promise<void> {
  const err = validateTrainingForm(f);
  if (err) throw new Error(err);

  const topicId = await ensureTopic(db, f);
  const loc = f.location.trim();
  await ensureLocation(db, loc);

  const moved = t.date !== f.date || t.start !== f.start || t.end !== f.end || t.location !== loc;
  const patch: Record<string, unknown> = {
    topic_id: topicId,
    team_id: f.team_id,
    date: f.date,
    start_time: f.start,
    end_time: f.end,
    location: loc,
    coords: f.coords,
    safety: f.safety,
    freq: f.freq,
    pickup: f.pickup,
    notes: f.notes,
  };

  if (t.start !== f.start || t.end !== f.end) {
    patch.departure = addMinutes(f.start, -DEPARTURE_LEAD_MINUTES);
    await sb().from('day_blocks').delete().eq('training_id', t.id);
    await sb()
      .from('day_blocks')
      .insert(
        defaultDayBlocks(f.start, f.end, topicId).map((b, i) => ({ ...b, training_id: t.id, sort: i })),
      );
  }

  const { error } = await sb().from('trainings').update(patch).eq('id', t.id);
  check(error);

  // a changed instructor or training commander is a fresh invitation
  if (t.instructor_id !== f.instructor_id)
    await rpc('invite_person', { tid: t.id, role: 'instructor', pid: f.instructor_id });
  if (t.commander_id !== f.commander_id)
    await rpc('invite_person', { tid: t.id, role: 'commander', pid: f.commander_id });

  if (moved)
    await notify(
      `${trainingTitle(db, t)} (${topicName(db, topicId)}) שונה: ${f.date} ${f.start}–${f.end} · ${loc}.`,
      participantIds(db, t),
      t.id,
    );
}

/** Inline edits from the period-management table. */
export async function patchTraining(
  db: Db,
  t: TrainingFull,
  key: 'date' | 'start' | 'end' | 'location' | 'team_id' | 'topic_id',
  value: string,
): Promise<void> {
  const patch: Record<string, unknown> = {};

  if (key === 'date') patch.date = value;
  else if (key === 'start' || key === 'end') {
    patch[key === 'start' ? 'start_time' : 'end_time'] = value;
    const start = key === 'start' ? value : t.start;
    const end = key === 'end' ? value : t.end;
    patch.departure = addMinutes(start, -DEPARTURE_LEAD_MINUTES);
    await sb().from('day_blocks').delete().eq('training_id', t.id);
    await sb()
      .from('day_blocks')
      .insert(
        defaultDayBlocks(start, end, t.topic_id).map((b, i) => ({ ...b, training_id: t.id, sort: i })),
      );
    await sb().from('vehicles').update({ departure: patch.departure }).eq('training_id', t.id);
  } else if (key === 'topic_id') {
    patch.topic_id = value;
    patch.safety = topicSafety(db, value) || t.safety;
  } else if (key === 'team_id') patch.team_id = value;
  else patch.location = value;

  const { error } = await sb().from('trainings').update(patch).eq('id', t.id);
  check(error);

  if (t.status === 'published' && ['date', 'start', 'end', 'location'].includes(key))
    await notify(
      `${trainingTitle(db, t)} (${topicName(db, t.topic_id)}) עודכן.`,
      participantIds(db, t),
      t.id,
    );
}

export const postponeTraining = (tid: string, date: string, start: string, end: string) =>
  rpc('postpone_training', { tid, new_date: date, new_start: start, new_end: end });

export const cancelTraining = (tid: string, reason: string) => rpc('cancel_training', { tid, reason });

export const finishTraining = (tid: string) => rpc('finish_training', { tid });

export async function deleteTraining(tid: string): Promise<void> {
  const { error } = await sb().from('trainings').delete().eq('id', tid);
  check(error);
}

/** Copies a training to the other team a week later (joint stays joint). */
export async function duplicateTraining(db: Db, t: TrainingFull): Promise<string> {
  const teamId: TrainingTeam = t.team_id === 'joint' ? 'joint' : t.team_id === 'a' ? 'b' : 'a';
  const draft = draftFor(db, {
    team_id: teamId,
    topic_id: t.topic_id,
    date: addDays(t.date, 7),
    start: t.start,
    end: t.end,
    location: t.location,
    coords: t.coords,
    commander_id: teamId === 'joint' ? t.commander_id : db.teams[teamId as TeamKey].commander_id,
    instructor_id: t.instructor_id,
    safety: t.safety,
    freq: t.freq,
    pickup: t.pickup,
    status: 'planned',
  });
  const { data, error } = await sb().rpc('create_trainings', { drafts: [draft], replace_existing: false });
  check(error);
  return (data as string[])?.[0];
}

/** Quick row from the management screen: a week after that team's last training. */
export async function addQuickTraining(db: Db, teamId: TrainingTeam): Promise<void> {
  const last = db.trainings
    .filter((t) => t.team_id === teamId && t.status !== 'cancelled')
    .map((t) => t.date)
    .sort()
    .slice(-1)[0];
  const date = last ? addDays(last, 7) : addDays(db.settings.period_start, 3);
  const draft = draftFor(db, {
    team_id: teamId,
    topic_id: db.topics[0]?.id ?? 'setup',
    date,
    start: '07:00',
    end: '17:00',
    location: '',
    commander_id: teamId === 'joint' ? db.teams.a.commander_id : db.teams[teamId as TeamKey].commander_id,
    status: 'planned',
  });
  const { error } = await sb().rpc('create_trainings', { drafts: [draft], replace_existing: false });
  check(error);
}

export async function runRotation(db: Db, cfg: RotationConfig): Promise<number> {
  const drafts = generateRotation(db, cfg).map((d) =>
    draftFor(db, {
      team_id: d.team_id,
      topic_id: d.topic_id,
      date: d.date,
      start: d.start,
      end: d.end,
      location: d.location,
      commander_id: d.commander_id,
      instructor_id: d.instructor_id,
      safety: d.safety,
      status: 'planned',
    }),
  );
  if (!drafts.length) throw new Error('נדרש לפחות שבוע אחד');

  const { error } = await sb().rpc('create_trainings', { drafts, replace_existing: cfg.replace });
  check(error);

  await ensureLocation(db, cfg.location);
  const { error: sErr } = await sb()
    .from('settings')
    .update({ period_start: sundayOf(cfg.start) })
    .eq('id', true);
  check(sErr);

  return drafts.length;
}

export async function clearTrainings(): Promise<void> {
  const { error } = await sb().from('trainings').delete().neq('status', 'done');
  check(error);
}

export async function shiftSchedule(days: number): Promise<void> {
  if (!days) throw new Error('הזן מספר ימים (חיובי = קדימה, שלילי = אחורה)');
  await rpc('shift_schedule', { days });
}

// ── invitations ────────────────────────────────────────────────────────────

export const invitePerson = (tid: string, role: InviteRole, pid: string) =>
  rpc('invite_person', { tid, role, pid });

export const respondInvite = (tid: string, role: InviteRole, accept: boolean) =>
  rpc('respond_invite', { tid, role, accept });

// ── drills ─────────────────────────────────────────────────────────────────
// The stations a training is made of, and what each fighter did at them.

export interface DrillForm {
  name: string;
  description: string;
  kind: Drill['kind'];
  rounds: number;
  weight: number;
}

export async function saveDrill(tid: string, f: DrillForm, id: string | null): Promise<void> {
  const name = f.name.trim();
  if (!name) throw new Error('נדרש שם למקצה');
  const row = {
    training_id: tid,
    name,
    description: f.description.trim(),
    kind: f.kind,
    rounds: Math.max(0, Math.round(f.rounds) || 0),
    weight: Math.min(10, Math.max(0.1, Number(f.weight) || 1)),
  };
  const { error } = id
    ? await sb().from('drills').update(row).eq('id', id)
    : await sb().from('drills').insert({ ...row, sort: 999 });
  check(error);
}

export async function removeDrill(id: string): Promise<void> {
  const { error } = await sb().from('drills').delete().eq('id', id);
  check(error);
}

/**
 * One fighter's result at one station.
 *
 * The score is not sent: for a hits drill the database computes it from the
 * counts, so two screens can never disagree about what 12 of 20 is worth.
 */
export async function saveDrillResult(
  drill: Drill,
  personId: string,
  by: string,
  v: { shots?: number | null; hits?: number | null; score?: number | null; note?: string },
): Promise<void> {
  if (drill.kind === 'hits' && v.shots != null && v.hits != null && v.hits > v.shots)
    throw new Error('לא ייתכן שמספר הפגיעות גדול ממספר הכדורים שנורו');

  const { error } = await sb().from('drill_results').upsert(
    {
      drill_id: drill.id,
      person_id: personId,
      shots: v.shots ?? null,
      hits: v.hits ?? null,
      score: drill.kind === 'hits' ? null : (v.score ?? null),
      note: v.note ?? '',
      by_id: by,
      at: new Date().toISOString(),
    },
    { onConflict: 'drill_id,person_id' },
  );
  check(error);
}

export async function clearDrillResult(drillId: string, personId: string): Promise<void> {
  const { error } = await sb()
    .from('drill_results')
    .delete()
    .eq('drill_id', drillId)
    .eq('person_id', personId);
  check(error);
}

/** The commander's grade for the training as a whole, 0–100. */
export async function setTrainingGrade(tid: string, value: number | null, note: string) {
  if (value !== null && (value < 0 || value > 100))
    throw new Error('ציון האימון חייב להיות בין 0 ל-100');
  await rpc('set_training_grade', { tid, value, note });
}

// ── logistics ──────────────────────────────────────────────────────────────

export async function addGear(db: Db, tid: string, name: string, qty: number): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('בחר או הקלד פריט');
  const { error } = await sb()
    .from('gear_items')
    .insert({ training_id: tid, name: clean, qty: qty || 1, sort: 999 });
  check(error);
  if (!db.gear_catalog.includes(clean)) await sb().from('gear_catalog').upsert({ name: clean });
}

export async function setGearReturned(id: string, returned: boolean): Promise<void> {
  const { error } = await sb()
    .from('gear_items')
    .update({ returned, ...(returned ? { missing: '' } : {}) })
    .eq('id', id);
  check(error);
}

export async function reportMissingGear(id: string, missing: string, ownerId: string): Promise<void> {
  const { error } = await sb()
    .from('gear_items')
    .update({ missing: missing.trim() || 'חוסר בספירה', owner_id: ownerId || null, returned: false })
    .eq('id', id);
  check(error);
}

export async function addVehicle(
  tid: string,
  v: { type: string; tz: string; driver_id: string; seats: number; departure: string },
): Promise<void> {
  if (!v.type) throw new Error('בחר סוג רכב');
  const { error } = await sb().from('vehicles').insert({
    training_id: tid,
    type: v.type,
    tz: v.tz,
    driver_id: v.driver_id || null,
    seats: v.seats || 4,
    departure: v.departure,
    sort: 999,
  });
  check(error);
}

export async function setVehicleField(
  id: string,
  key: 'type' | 'tz' | 'driver_id' | 'seats' | 'departure' | 'fitness' | 'fault',
  value: string,
): Promise<void> {
  const patch: Record<string, unknown> =
    key === 'seats'
      ? { seats: Number(value) || 0 }
      : key === 'driver_id'
        ? { driver_id: value || null }
        : key === 'fitness'
          ? { fitness: value as Fitness, ...(value === 'כשיר' ? { fault: '' } : {}) }
          : { [key]: value };
  const { error } = await sb().from('vehicles').update(patch).eq('id', id);
  check(error);
}

export async function addAmmo(
  db: Db,
  t: TrainingFull,
  weapon: string,
  perFighter: number,
  total: number,
): Promise<void> {
  if (!weapon) throw new Error('בחר נשק');
  const n = participants(db, t).length;
  const allocated = perFighter ? perFighter * n : total;
  if (!allocated) throw new Error('הזן כמות כדורים');
  const { error } = await sb()
    .from('ammo')
    .insert({ training_id: t.id, weapon, per_fighter: perFighter, allocated, sort: 999 });
  check(error);
  await sb().from('trainings').update({ ammo_signed: false }).eq('id', t.id);
}

export async function setAmmoField(
  db: Db,
  t: TrainingFull,
  id: string,
  key: 'per_fighter' | 'allocated' | 'used',
  value: number,
): Promise<void> {
  const patch: Record<string, unknown> = { [key]: value };
  // entering rounds-per-fighter recomputes the allocation for the whole roster
  if (key === 'per_fighter' && value) patch.allocated = value * participants(db, t).length;
  const { error } = await sb().from('ammo').update(patch).eq('id', id);
  check(error);
  if (key !== 'used') await sb().from('trainings').update({ ammo_signed: false }).eq('id', t.id);
}

export async function signAmmo(t: TrainingFull, user: Person): Promise<boolean> {
  const next = !t.ammo_signed;
  const { error } = await sb()
    .from('trainings')
    .update({
      ammo_signed: next,
      ammo_signed_by: next ? user.id : null,
      ammo_signed_at: next ? new Date().toISOString() : null,
    })
    .eq('id', t.id);
  check(error);
  return next;
}

export async function addFood(
  tid: string,
  f: { name: string; qty: number; unit: string },
): Promise<void> {
  if (!f.name) throw new Error('בחר פריט מזון');
  const { error } = await sb()
    .from('food')
    .insert({ training_id: tid, name: f.name, qty: f.qty || 1, unit: f.unit || 'יח׳', sort: 999 });
  check(error);
}

export async function setFoodField(id: string, key: 'qty' | 'note', value: string): Promise<void> {
  const patch = key === 'qty' ? { qty: Number(value) || 0 } : { note: value };
  const { error } = await sb().from('food').update(patch).eq('id', id);
  check(error);
}

export async function removeRow(
  table: 'gear_items' | 'vehicles' | 'ammo' | 'food' | 'day_blocks' | 'photos',
  id: string,
): Promise<void> {
  const { error } = await sb().from(table).delete().eq('id', id);
  check(error);
}

export async function addDayBlock(tid: string, time: string, title: string): Promise<void> {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !title.trim())
    throw new Error('נדרשים שעה (HH:MM) וכותרת');
  const { error } = await sb()
    .from('day_blocks')
    .insert({ training_id: tid, time, title: title.trim(), sort: 500 });
  check(error);
}

export async function setTrainingField(
  tid: string,
  key: 'medic_id' | 'evac_vehicle_id',
  value: string,
): Promise<void> {
  const { error } = await sb()
    .from('trainings')
    .update({ [key]: value || null })
    .eq('id', tid);
  check(error);
}

export async function setSummaryField(
  t: TrainingFull,
  key: keyof TrainingFull['summary'],
  value: string,
): Promise<void> {
  const { error } = await sb()
    .from('trainings')
    .update({ summary: { ...t.summary, [key]: value } })
    .eq('id', t.id);
  check(error);
}

// ── chat, feedback, photos ─────────────────────────────────────────────────

export async function sendMessage(
  tid: string,
  authorId: string,
  text: string,
  attachment: TrainingFull['chat'][number]['attachment'],
): Promise<void> {
  if (!text.trim() && !attachment) return;
  const { error } = await sb().from('chat_messages').insert({
    training_id: tid,
    author_id: authorId,
    text: text.trim(),
    read_by: [authorId],
    attachment,
  });
  check(error);
}

export async function togglePin(id: string, pinned: boolean): Promise<void> {
  const { error } = await sb().from('chat_messages').update({ pinned }).eq('id', id);
  check(error);
}

export const markChatRead = (tid: string) => rpc('mark_chat_read', { tid });
export const markNotificationsRead = () => rpc('mark_notifications_read');

export async function saveFeedback(
  tid: string,
  personId: string,
  fb: { overall: number; instructor: number; logistics: number; comment: string },
): Promise<void> {
  if (!fb.overall) throw new Error('בחר דירוג כללי');
  const { error } = await sb().from('feedback').upsert(
    {
      training_id: tid,
      person_id: personId,
      overall: fb.overall,
      instructor: fb.instructor || null,
      logistics: fb.logistics || null,
      comment: fb.comment.trim(),
      time: new Date().toISOString(),
    },
    { onConflict: 'training_id,person_id' },
  );
  check(error);
}

export async function addPhoto(
  tid: string,
  personId: string,
  file: File,
): Promise<void> {
  const path = `${tid}/${crypto.randomUUID()}-${file.name}`;
  const { error: upErr } = await sb().storage.from('training-photos').upload(path, file);
  if (upErr) throw new Error(`העלאת התמונה נכשלה: ${upErr.message}`);
  const { error } = await sb()
    .from('photos')
    .insert({ training_id: tid, name: file.name, path, by_id: personId });
  check(error);
}

export async function attachOrder(tid: string, file: File): Promise<void> {
  const path = `${tid}/${crypto.randomUUID()}-${file.name}`;
  const { error: upErr } = await sb().storage.from('training-orders').upload(path, file);
  if (upErr) throw new Error(`צירוף הקובץ נכשל: ${upErr.message}`);
  const { error } = await sb()
    .from('trainings')
    .update({ order_file: { name: file.name, size: Math.round(file.size / 1024), path } })
    .eq('id', tid);
  check(error);
}

/** Signed URL for a private object; the buckets are never public. */
export async function signedUrl(bucket: string, path: string): Promise<string | null> {
  const { data } = await sb().storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// ── people ─────────────────────────────────────────────────────────────────

export interface PersonForm {
  name: string;
  rank: string;
  role: string;
  pn: string;
  phone: string;
  team_id: string;
  rating: number;
  status: 'active' | 'inactive';
  status_note: string;
  is_team_commander: boolean;
  is_instructor: boolean;
  is_admin: boolean;
  is_hapak_commander: boolean;
  qual: string[];
  certs: Record<string, string>;
  weapon: string;
  weapon_serial: string;
  medical_profile: string; // kept as text in the form; '' means not entered
  limitations: string;
}

export async function savePerson(
  db: Db,
  user: Person,
  form: PersonForm,
  personId: string | null,
): Promise<void> {
  if (!form.name.trim()) throw new Error('נדרש שם מלא');
  if (!/^\d{7}$/.test(form.pn)) throw new Error('מספר אישי חייב להיות 7 ספרות');
  if (db.people.some((p) => p.pn === form.pn && p.id !== personId))
    throw new Error('מספר אישי כבר קיים במערכת');

  // marking someone team commander renames the outgoing one's role
  const role = form.is_team_commander
    ? 'מפקד צוות'
    : form.role === 'מפקד צוות'
      ? 'קמב״צ'
      : form.role;

  const certs = Object.fromEntries(
    Object.entries(form.certs).filter(([, v]) => v && /^\d{4}-\d{2}-\d{2}$/.test(v)),
  );

  const row = {
    name: form.name.trim(),
    rank: form.rank,
    role,
    pn: form.pn,
    phone: form.phone.trim(),
    team_id: form.team_id || null,
    rating: Math.max(1, Math.min(10, form.rating || 7)),
    status: form.status,
    status_note: form.status === 'active' ? '' : form.status_note,
    is_team_commander: form.is_team_commander,
    is_instructor: form.is_instructor || form.qual.length > 0,
    is_admin: form.is_admin,
    is_hapak_commander: form.is_hapak_commander,
    qual: form.qual,
    certs,
    weapon: form.weapon.trim(),
    weapon_serial: form.weapon_serial.trim(),
    // 21–97 is the Israeli scale; anything else is treated as not entered
    medical_profile: /^\d{2}$/.test(form.medical_profile.trim())
      ? Number(form.medical_profile.trim())
      : null,
    limitations: form.limitations.trim(),
  };

  if (row.medical_profile !== null && (row.medical_profile < 21 || row.medical_profile > 97))
    throw new Error('פרופיל רפואי חייב להיות בין 21 ל-97 (או ריק)');

  // never let an administrator strip their own management rights
  if (personId === user.id && !row.is_admin && !row.is_hapak_commander) {
    row.is_admin = true;
  }

  let id = personId;
  if (personId) {
    const { error } = await sb().from('people').update(row).eq('id', personId);
    check(error);
  } else {
    const { error } = await sb().from('people').insert(row);
    check(error);
    // `people` is not readable directly (that is what hides pn), so the new
    // row's id comes back from the masked view instead of an insert…returning
    const { data } = await sb().from('people_view').select('id').eq('pn', row.pn).maybeSingle();
    id = (data as { id: string } | null)?.id ?? null;
  }

  if (row.is_team_commander && row.team_id) {
    const teamId = row.team_id as TeamKey;
    // demote whoever held the post before
    await Promise.all(
      db.people
        .filter((o) => o.id !== id && o.team_id === teamId && o.is_team_commander)
        .map((o) =>
          sb()
            .from('people')
            .update({ is_team_commander: false, ...(o.role === 'מפקד צוות' ? { role: 'קמב״צ' } : {}) })
            .eq('id', o.id),
        ),
    );
    await sb().from('teams').update({ commander_id: id }).eq('id', teamId);
  }
}

export async function quickAddPerson(
  db: Db,
  f: { name: string; rank: string; role: string; pn: string; phone: string; team_id: TeamKey },
): Promise<void> {
  if (!f.name.trim()) throw new Error('נדרש שם מלא');
  if (!/^\d{7}$/.test(f.pn)) throw new Error('מספר אישי — 7 ספרות');
  if (db.people.some((p) => p.pn === f.pn)) throw new Error('המספר האישי כבר קיים במערכת');
  const { error } = await sb().from('people').insert({
    name: f.name.trim(),
    rank: f.rank,
    role: f.role,
    pn: f.pn,
    phone: f.phone.trim(),
    team_id: f.team_id,
    rating: 7,
  });
  check(error);
}

/** Weapon, its serial and the certifications — the סמל צוות's part of a card. */
export interface KitForm {
  weapon: string;
  weapon_serial: string;
  certs: Record<string, string>;
}

/**
 * Writes only those three columns.
 *
 * Deliberately not `savePerson`: that one sends the whole row, and a סמל צוות
 * cannot see everyone's personal number — the form would carry a blank one and
 * either wipe it or be refused outright. The database allows him these columns
 * and nothing else, so this is what the screen sends.
 */
export async function saveKit(pid: string, form: KitForm): Promise<void> {
  const certs = Object.fromEntries(
    Object.entries(form.certs).filter(([, v]) => v && /^\d{4}-\d{2}-\d{2}$/.test(v)),
  );
  const { error } = await sb()
    .from('people')
    .update({
      weapon: form.weapon.trim(),
      weapon_serial: form.weapon_serial.trim(),
      certs,
    })
    .eq('id', pid);
  check(error);
}

export async function removePerson(pid: string): Promise<void> {
  const { error } = await sb().from('people').delete().eq('id', pid);
  check(error);
}

export const resetPin = (pid: string) => rpc('reset_pin', { pid });

/** Ends every session that person has open, without changing their code. */
export const revokeSessions = (pid: string) => rpc('revoke_sessions', { pid });

/** Closes the period that is running and opens the next one, keeping a summary. */
export async function closePeriod(name: string, start: string, note: string): Promise<void> {
  if (!name.trim()) throw new Error('נדרש שם לתקופה החדשה');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('תאריך התחלה לא תקין');
  await rpc('close_period', { new_name: name.trim(), new_start: start, note: note.trim() });
}

export const setMyNotif = (prefs: Person['notif']) => rpc('set_my_notif', { prefs });

// ── settings, catalogs, topics ─────────────────────────────────────────────

export async function saveSettings(
  s: Partial<Db['settings']> & { team_a?: string; team_b?: string },
): Promise<void> {
  const { team_a, team_b, ...settings } = s;
  const { error } = await sb().from('settings').update(settings).eq('id', true);
  check(error);
  if (team_a) await sb().from('teams').update({ name: team_a }).eq('id', 'a');
  if (team_b) await sb().from('teams').update({ name: team_b }).eq('id', 'b');
}

export async function addCatalogItem(
  table: 'gear_catalog' | 'vehicle_types' | 'locations',
  name: string,
): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('הקלד שם');
  const { error } = await sb().from(table).upsert({ name: clean });
  check(error);
}

export async function removeCatalogItem(
  table: 'gear_catalog' | 'vehicle_types' | 'locations',
  name: string,
): Promise<void> {
  const { error } = await sb().from(table).delete().eq('name', name);
  check(error);
}

// ── the vehicle fleet ──────────────────────────────────────────────────────
// Entered once with its צ׳, then picked from a list. A training keeps a copy of
// the row, so editing the fleet never rewrites what went out on a past date.

export interface FleetForm {
  tz: string;
  type: string;
  seats: number;
  fitness: FleetVehicle['fitness'];
  note: string;
  active: boolean;
}

export async function saveFleetVehicle(f: FleetForm, id: string | null): Promise<void> {
  const tz = f.tz.trim();
  const type = f.type.trim();
  if (!tz) throw new Error('נדרש מספר צ׳');
  if (!type) throw new Error('נדרש סוג רכב');
  const row = {
    tz,
    type,
    seats: Number(f.seats) || 4,
    fitness: f.fitness,
    note: f.note.trim(),
    active: f.active,
  };
  const { error } = id
    ? await sb().from('fleet').update(row).eq('id', id)
    : await sb().from('fleet').insert(row);
  if (error?.code === '23505') throw new Error('מספר הצ׳ הזה כבר קיים בצי');
  check(error);
}

export async function removeFleetVehicle(id: string): Promise<void> {
  const { error } = await sb().from('fleet').delete().eq('id', id);
  check(error);
}

export async function saveTopic(id: string, patch: { name?: string; safety?: string }): Promise<void> {
  const { error } = await sb().from('topics').update(patch).eq('id', id);
  check(error);
}

export async function addTopic(db: Db, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('הקלד שם נושא');
  const { error } = await sb()
    .from('topics')
    .insert({ id: `tp_${Math.random().toString(36).slice(2, 8)}`, name: clean, safety: '', sort: db.topics.length + 1 });
  check(error);
}

export async function removeTopic(db: Db, id: string): Promise<void> {
  if (db.trainings.some((t) => t.topic_id === id))
    throw new Error('הנושא משויך לאימון — שנה את נושא האימון לפני המחיקה');
  const { error } = await sb().from('topics').delete().eq('id', id);
  check(error);
}

// ── brigade calendar ───────────────────────────────────────────────────────

export async function saveCalendarEvent(
  eventId: string | null,
  e: Omit<CalendarEvent, 'id' | 'source'>,
): Promise<void> {
  if (!e.title.trim()) throw new Error('נדרשת כותרת');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error('תאריך לא תקין');
  if (!e.all_day && e.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time))
    throw new Error('שעה לא תקינה');

  const row = {
    title: e.title.trim(),
    date: e.date,
    time: e.all_day ? '' : e.time,
    all_day: e.all_day,
    location: e.location.trim(),
    training_id: e.training_id || null,
    note: e.note.trim(),
  };
  const { error } = eventId
    ? await sb().from('calendar_events').update(row).eq('id', eventId)
    : await sb().from('calendar_events').insert(row);
  check(error);
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const { error } = await sb().from('calendar_events').delete().eq('id', id);
  check(error);
}

// ── join requests ──────────────────────────────────────────────────────────

export async function submitJoinRequest(f: {
  name: string;
  rank: string;
  role: string;
  pn: string;
  phone: string;
  team_id: TeamKey;
}): Promise<void> {
  if (!f.name.trim() || !/^\d{7}$/.test(f.pn))
    throw new Error('נדרשים שם מלא ומספר אישי בן 7 ספרות');
  const { error } = await sb().from('join_requests').insert({
    name: f.name.trim(),
    rank: f.rank,
    role: f.role,
    pn: f.pn,
    phone: f.phone.trim(),
    team_id: f.team_id,
    status: 'pending',
  });
  check(error);
}

export const decideJoinRequest = (jid: string, accept: boolean) =>
  rpc('approve_join_request', { jid, accept });

// ── helpers used by screens ────────────────────────────────────────────────

export const upcomingTrainings = activeTrainings;
export const nameOf = (db: Db, id: string | null) => fullName(personById(db, id));
