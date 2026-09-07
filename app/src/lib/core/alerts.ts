import { CERT_GATED_TOPICS, CERT_TYPES } from './constants';
import { daysBetween, fmtFull, stampToMs } from './dates';
import {
  attendanceStats,
  fullName,
  isPendingSummary,
  participants,
  taughtCount,
} from './selectors';
import type { CertType, Db, InviteRole, Person, TrainingFull } from './types';

export type CertState = 'none' | 'ok' | 'soon' | 'expired';

export function certStatus(p: Person, type: CertType, today: string, alertDays: number): CertState {
  const exp = p.certs?.[type];
  if (!exp) return 'none';
  const d = daysBetween(today, exp);
  return d < 0 ? 'expired' : d <= (alertDays || 30) ? 'soon' : 'ok';
}

export interface CertAlert {
  p: Person;
  type: CertType;
  label: string;
  expires: string;
  status: CertState;
  text: string;
}

export function certAlerts(db: Db, today: string): CertAlert[] {
  const out: CertAlert[] = [];
  db.people
    .filter((p) => p.status === 'active')
    .forEach((p) => {
      CERT_TYPES.forEach(([k, label]) => {
        const s = certStatus(p, k, today, db.settings.cert_alert_days);
        if (s === 'soon' || s === 'expired') {
          const expires = p.certs[k] as string;
          out.push({
            p,
            type: k,
            label,
            expires,
            status: s,
            text: `${fullName(p)} — ${label} ${s === 'expired' ? 'פקעה' : 'פוקעת'} ב-${fmtFull(expires)}`,
          });
        }
      });
    });
  return out;
}

/** An invitation that has sat unanswered past the configured window (48h by default). */
export function inviteOverdue(
  db: Db,
  t: TrainingFull,
  role: InviteRole,
  today: string,
  now: string,
): boolean {
  const st = role === 'instructor' ? t.inst_status : t.cmd_status;
  const at = role === 'instructor' ? t.inst_invited_at : t.cmd_invited_at;
  if (st !== 'pending' || !at) return false;
  return stampToMs(`${today} ${now}`) - stampToMs(at) > (db.settings.invite_hours || 48) * 3600000;
}

export function summaryLocked(
  db: Db,
  t: TrainingFull,
  user: Person | null,
  today: string,
): boolean {
  if (user && (user.is_admin || user.is_hapak_commander)) return false;
  return t.status === 'done' && daysBetween(t.date, today) > (db.settings.summary_lock_days || 7);
}

/**
 * The commander's alert list for a training. Same order and wording as the
 * prototype — these strings are read out loud in briefings.
 */
export function trainingAlerts(db: Db, t: TrainingFull, today: string, now: string): string[] {
  if (t.status === 'cancelled' || t.status === 'done') return [];
  const s = attendanceStats(db, t);
  const out: string[] = [];
  const min = t.team_id === 'joint' ? db.settings.min_attendance * 2 : db.settings.min_attendance;

  if (s.responded > 0 && s.expected < min)
    out.push(`צפויים ${s.expected} לוחמים — מתחת לסף המינימום (${min})`);
  if (s.unresponded > 0) out.push(`${s.unresponded} טרם סימנו נוכחות`);

  const ps = participants(db, t);
  db.settings.essential_roles.forEach((role) => {
    const has = ps.some(
      (p) => p.role === role && t.attendance[p.id] && ['coming', 'late'].includes(t.attendance[p.id].status),
    );
    if (!has && s.responded > 0)
      out.push(role === 'חובש' ? 'אין חובש שסימן ״מגיע״' : `אין ${role} שסימן ״מגיע״`);
  });

  const drivers = ps.filter(
    (p) =>
      p.role === 'נהג' && t.attendance[p.id] && ['coming', 'late'].includes(t.attendance[p.id].status),
  ).length;
  if (s.responded > 0 && drivers < t.vehicles.length)
    out.push(`${drivers} נהגים מגיעים ל-${t.vehicles.length} רכבים`);

  if (t.inst_status !== 'accepted')
    out.push(
      t.inst_status === 'declined'
        ? 'המדריך דחה את ההזמנה — נדרש מחליף'
        : 'הזמנת המדריך טרם אושרה',
    );
  if (t.cmd_status !== 'accepted')
    out.push(
      t.cmd_status === 'declined'
        ? 'מפקד האימון דחה את ההזמנה — נדרש מחליף'
        : 'הזמנת מפקד האימון טרם אושרה',
    );

  if (t.vehicles.some((v) => v.fitness !== 'כשיר')) out.push('רכב אחד או יותר אינו כשיר');

  const hours = db.settings.invite_hours || 48;
  if (inviteOverdue(db, t, 'instructor', today, now))
    out.push(`הזמנת המדריך ללא מענה מעל ${hours} שעות — מומלץ להזמין מחליף`);
  if (inviteOverdue(db, t, 'commander', today, now))
    out.push(`הזמנת מפקד האימון ללא מענה מעל ${hours} שעות`);

  const gated = (CERT_GATED_TOPICS as readonly string[]).includes(t.topic_id)
    ? (t.topic_id as CertType)
    : null;
  if (gated) {
    const label = CERT_TYPES.find((c) => c[0] === gated)![1];
    ps.forEach((p) => {
      if (certStatus(p, gated, today, db.settings.cert_alert_days || 30) === 'expired')
        out.push(`${fullName(p)} — הסמכת ${label} פקעה (אזהרה בלבד)`);
    });
  }

  if (isPendingSummary(t, today)) out.push('האימון עבר — ממתין לסיכום ולאישור נוכחות סופי');
  return out;
}

export interface Substitute {
  p: Person;
  score: number;
  why: string[];
}

/**
 * Scores a stand-in for an instructor or training commander:
 * certified for the topic +4, free that day +2, has taught the topic before +2,
 * from the other team +1, minus 0.3 per training already taught this period.
 */
export function suggestSubstitute(db: Db, t: TrainingFull, role: InviteRole): Substitute | null {
  const currentId = role === 'instructor' ? t.instructor_id : t.commander_id;
  const cands = db.people.filter(
    (p) =>
      p.status === 'active' &&
      p.id !== currentId &&
      (role === 'instructor'
        ? p.is_instructor
        : p.is_team_commander || p.role === 'קמב״צ' || p.is_hapak_commander),
  );

  const scored = cands
    .map((p) => {
      let score = 0;
      const why: string[] = [];
      if (role === 'instructor' && p.qual.includes(t.topic_id)) {
        score += 4;
        why.push('מוסמך לנושא');
      }
      const busy = db.trainings.some(
        (x) =>
          x.id !== t.id &&
          x.date === t.date &&
          x.status !== 'cancelled' &&
          (x.instructor_id === p.id || x.commander_id === p.id),
      );
      if (!busy) {
        score += 2;
        why.push('זמין באותו יום');
      }
      if (t.team_id !== 'joint' && p.team_id && p.team_id !== t.team_id) {
        score += 1;
        why.push('מהצוות השני');
      }
      if (
        db.trainings.some(
          (x) => x.id !== t.id && x.topic_id === t.topic_id && x.instructor_id === p.id && x.date < t.date,
        )
      ) {
        score += 2;
        why.push('העביר את הנושא בעבר');
      }
      const n = taughtCount(db, p.id);
      score -= n * 0.3;
      if (n === 0) why.push('טרם העביר אימון בתקופה');
      return { p, score, why };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0] ?? null;
}
