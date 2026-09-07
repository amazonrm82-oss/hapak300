import { participants } from './selectors';
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

/**
 * Readiness 1–10: commander rating 50%, approved attendance 25%, topics
 * completed 25%. Until a training has actually finished there is nothing to
 * measure, so the score is the commander rating alone (the weights renormalise).
 * Visible to commanders only.
 */
export function readinessOf(db: Db, filterFn: (p: Person) => boolean): Readiness {
  const members = db.people.filter((p) => p.status === 'active' && p.team_id && filterFn(p));
  if (!members.length) return { score: 0, parts: [], note: 'אין לוחמים' };

  const ratingAvg = members.reduce((s, p) => s + (p.rating || 0), 0) / members.length;
  const done = db.trainings.filter(
    (t) => t.status === 'done' && members.some((p) => t.team_id === 'joint' || t.team_id === p.team_id),
  );

  const parts: ReadinessPart[] = [{ label: 'דירוג מפקד', w: 0.5, v: ratingAvg }];

  if (done.length) {
    let slots = 0;
    let present = 0;
    const topics = new Set<string>();
    done.forEach((t) => {
      const ps = participants(db, t).filter((p) => members.some((m) => m.id === p.id));
      slots += ps.length;
      ps.forEach((p) => {
        const a = t.attendance[p.id];
        if (a && a.approved && a.status === 'coming') present++;
      });
      topics.add(t.topic_id);
    });
    parts.push({ label: 'נוכחות מאושרת', w: 0.25, v: slots ? (10 * present) / slots : 0 });
    parts.push({ label: 'נושאים שהושלמו', w: 0.25, v: (10 * topics.size) / Math.max(1, db.topics.length) });
  }

  const wsum = parts.reduce((s, p) => s + p.w, 0);
  const score = Math.round((10 * parts.reduce((s, p) => s + p.w * p.v, 0)) / wsum) / 10;

  return {
    score,
    parts,
    note: done.length ? `${done.length} אימונים הסתיימו` : 'כשירות התחלתית — לפי דירוג מפקד בלבד',
  };
}
