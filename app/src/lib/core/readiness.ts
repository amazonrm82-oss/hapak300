import { isRostered, participants } from './selectors';
import { scoreOne } from './drills';
import type { Db, Person } from './types';

export interface ReadinessPart {
  label: string;
  w: number;
  v: number;
}

export interface Readiness {
  score: number;
  parts: ReadinessPart[];
  note: string;
}

/** 0–10, whatever the arithmetic threw up. */
const clamp = (v: number) => Math.max(0, Math.min(10, v));

/**
 * Readiness 1–10, from four things in equal weight:
 *
 *   דירוג מפקד          — the rating a commander sets by hand on the profile
 *   נוכחות מאושרת       — turned up, and the commander approved it
 *   ציון באימונים       — what the fighters actually did at the stations
 *   ציון המפקד לאימון   — the commander's own mark for the training as a whole
 *
 * Only the first is known before any training has finished, so a part with
 * nothing behind it is left out and the rest renormalise. That keeps a brand
 * new team from reading 2.5/10 because three quarters of the measurement have
 * not happened yet — a missing measurement is not a bad one.
 *
 * Visible to commanders only.
 */
export function readinessOf(db: Db, filterFn: (p: Person) => boolean): Readiness {
  const members = db.people.filter((p) => p.status === 'active' && p.team_id && filterFn(p));
  if (!members.length) return { score: 0, parts: [], note: 'אין לוחמים' };

  const ids = new Set(members.map((p) => p.id));
  const ratingAvg = members.reduce((s, p) => s + (p.rating || 0), 0) / members.length;
  // סדיר is rostered to every training, so membership is asked of the roster
  // rule rather than compared by team id
  const done = db.trainings.filter(
    (t) => t.status === 'done' && members.some((p) => isRostered(db, p, t.team_id)),
  );

  let slots = 0;
  let present = 0;
  let scoreSum = 0;
  let scored = 0;
  let gradeSum = 0;
  let graded = 0;

  done.forEach((t) => {
    const ps = participants(db, t).filter((p) => ids.has(p.id));
    if (!ps.length) return;
    slots += ps.length;
    ps.forEach((p) => {
      const a = t.attendance[p.id];
      if (a && a.approved && a.status === 'coming') present++;
      // a fighter still awaiting a makeup has no score yet and is not averaged
      // in as a zero; one who simply did not turn up is, and that is the point
      const s = scoreOne(db, t, p).score;
      if (s !== null) {
        scoreSum += s;
        scored++;
      }
    });
    if (t.grade != null) {
      gradeSum += t.grade;
      graded++;
    }
  });

  const parts: ReadinessPart[] = [{ label: 'דירוג מפקד', w: 0.25, v: clamp(ratingAvg) }];
  if (slots) parts.push({ label: 'נוכחות מאושרת', w: 0.25, v: clamp((10 * present) / slots) });
  // both of these are 0–100 on their own screens and a tenth of that here
  if (scored) parts.push({ label: 'ציון באימונים', w: 0.25, v: clamp(scoreSum / scored / 10) });
  if (graded) parts.push({ label: 'ציון המפקד לאימון', w: 0.25, v: clamp(gradeSum / graded / 10) });

  const wsum = parts.reduce((s, p) => s + p.w, 0);
  const score = Math.round((10 * parts.reduce((s, p) => s + p.w * p.v, 0)) / wsum) / 10;

  return {
    score,
    parts,
    note: done.length ? `${done.length} אימונים הסתיימו` : 'כשירות התחלתית — לפי דירוג מפקד בלבד',
  };
}
