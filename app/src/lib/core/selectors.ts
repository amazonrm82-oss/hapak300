import { RANK_ORDER, STATUS_LABEL, TRAINING_STATUS } from './constants';
import { addDays, pad, weekOf } from './dates';
import type {
  Db,
  Person,
  TeamKey,
  Training,
  TrainingFull,
  TrainingTeam,
} from './types';

export const byId = <T extends { id: string }>(list: T[], id: string | null | undefined): T | null =>
  (id ? list.find((x) => x.id === id) : undefined) ?? null;

export const personById = (db: Db, id: string | null | undefined) => byId(db.people, id);
export const topicById = (db: Db, id: string | null | undefined) => byId(db.topics, id);
export const topicName = (db: Db, id: string | null | undefined) => topicById(db, id)?.name ?? 'נושא חדש';
export const topicSafety = (db: Db, id: string | null | undefined) => topicById(db, id)?.safety ?? '';

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return p.length > 1 ? `${p[0][0]}.${p[1][0]}` : p[0].slice(0, 2);
}

export function fullName(p: Person | null | undefined): string {
  return p ? `${p.rank} ${p.name}` : '—';
}

export function rankSort(a: Person, b: Person): number {
  return (
    (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99) || a.name.localeCompare(b.name, 'he')
  );
}

export function teamName(db: Db, teamId: TrainingTeam | TeamKey | null): string {
  if (teamId === 'joint') return 'משותף';
  if (teamId === 'a' || teamId === 'b') return db.teams[teamId]?.name ?? '—';
  return '—';
}

export function trainingCode(t: Pick<Training, 'team_id' | 'seq'>): string {
  return t.team_id === 'joint' ? `משותף ${pad(t.seq)}` : `אימון ${pad(t.seq)}`;
}

export function trainingTitle(db: Db, t: Pick<Training, 'team_id' | 'seq'>): string {
  return `${trainingCode(t)} · ${teamName(db, t.team_id)}`;
}

export const statusLabel = (t: Pick<Training, 'status'>) => TRAINING_STATUS[t.status];

/** Everyone rostered to a team who takes part in this training. */
/** Whose training this is: the rostered team, plus anyone in a team that joins
 *  every training — סדיר trains with א׳ and ב׳ and never on its own. */
export function participants(db: Db, t: Pick<Training, 'team_id'>): Person[] {
  return db.people.filter((p) => isRostered(db, p, t.team_id)).sort(rankSort);
}

/** True when this person takes part in a training held by `teamId`. */
export function isRostered(db: Db, p: Person, teamId: TrainingTeam): boolean {
  if (p.status !== 'active' || !p.team_id) return false;
  if (teamId === 'joint' || p.team_id === teamId) return true;
  return !!db.teams[p.team_id]?.attends_all;
}

export function teamMembers(db: Db, teamId: TeamKey): Person[] {
  return db.people.filter((p) => p.team_id === teamId).sort(rankSort);
}

/** Trainings still ahead of the archive: neither finished nor cancelled, by date. */
export function activeTrainings(db: Db): TrainingFull[] {
  return db.trainings
    .filter((t) => t.status !== 'cancelled' && t.status !== 'done')
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Upcoming trainings this person is part of — as a fighter, instructor or commander. */
export function upcomingFor(db: Db, user: Person, today: string): TrainingFull[] {
  return activeTrainings(db).filter(
    (t) =>
      t.date >= today &&
      (!user.team_id
        ? true
        : t.team_id === 'joint' ||
          t.team_id === user.team_id ||
          t.instructor_id === user.id ||
          t.commander_id === user.id),
  );
}

/** Trainings happening today or tomorrow, for the home-screen banner. */
export function bannerTrainings(db: Db, user: Person, today: string): TrainingFull[] {
  const tomorrow = addDays(today, 1);
  return activeTrainings(db).filter(
    (t) =>
      (t.date === today || t.date === tomorrow) &&
      (!user.team_id ||
        t.team_id === 'joint' ||
        t.team_id === user.team_id ||
        t.instructor_id === user.id ||
        t.commander_id === user.id),
  );
}

export interface AttStats {
  total: number;
  coming: number;
  late: number;
  absent: number;
  responded: number;
  unresponded: number;
  approved: number;
  expected: number;
  pct: number;
}

/** 'מאחר' counts towards the expected head-count; everything else is an absence. */
export function attendanceStats(db: Db, t: TrainingFull): AttStats {
  const ps = participants(db, t);
  const s = { total: ps.length, coming: 0, late: 0, absent: 0, responded: 0, unresponded: 0, approved: 0 };
  ps.forEach((p) => {
    const a = t.attendance[p.id];
    if (!a) {
      s.unresponded++;
      return;
    }
    s.responded++;
    if (a.status === 'coming') s.coming++;
    else if (a.status === 'late') s.late++;
    else s.absent++;
    if (a.approved) s.approved++;
  });
  return {
    ...s,
    expected: s.coming + s.late,
    pct: s.total ? Math.round((100 * s.responded) / s.total) : 0,
  };
}

export function attendanceLabel(t: TrainingFull, personId: string): string {
  const a = t.attendance[personId];
  return a ? STATUS_LABEL[a.status] : 'לא הגיב';
}

/** How many trainings this person has instructed in the period (before `before`, if given). */
export function taughtCount(db: Db, pid: string, before?: string): number {
  return db.trainings.filter(
    (t) => t.instructor_id === pid && t.status !== 'cancelled' && (!before || t.date < before),
  ).length;
}

/** The training has passed but was never summarised or finally approved. */
export function isPendingSummary(t: Training, today: string): boolean {
  return t.date < today && t.status !== 'done' && t.status !== 'cancelled';
}

/** Highest week number in use; the timeline never shows fewer than 4 columns. */
export function periodWeeks(db: Db): number {
  const ws = db.trainings
    .filter((t) => t.status !== 'cancelled')
    .map((t) => weekOf(db.settings.period_start, t.date));
  return Math.max(4, ...ws);
}

export function clampWeek(db: Db, w: number): number {
  return Math.max(1, Math.min(w, periodWeeks(db)));
}

export function weekOfDb(db: Db, iso: string): number {
  return weekOf(db.settings.period_start, iso);
}

export function notifsFor(db: Db, user: Person | null): Db['notifications'] {
  return db.notifications.filter((n) => !n.to || (user ? n.to.includes(user.id) : false));
}
