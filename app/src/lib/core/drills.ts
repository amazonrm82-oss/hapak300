import type { Db, Drill, DrillResult, Person, TrainingFull } from './types';
import { participants } from './selectors';

/**
 * What a training's stations add up to.
 *
 * A drill scores 0–100. A fighter's score for the training is the weighted
 * average of the drills they actually took part in — a station somebody missed
 * does not count against them, because "no result" and "zero" are different
 * facts and the difference matters when a fighter is pulled off a range.
 *
 * The team's score is the average of the fighters who have any result at all,
 * for the same reason.
 */

/** 0–100 for one result, or null when nothing was recorded. */
export function resultScore(drill: Drill, r: DrillResult | undefined): number | null {
  if (!r) return null;
  if (drill.kind === 'hits') {
    if (r.shots == null || r.hits == null || r.shots <= 0) return null;
    return Math.round((10000 * r.hits) / r.shots) / 100;
  }
  return r.score ?? null;
}

export interface PersonScore {
  person: Person;
  /** Weighted average across the drills this fighter has a result for, or null. */
  score: number | null;
  done: number;
  total: number;
}

/** Every participant's score for the training, in roster order. */
export function scoresFor(db: Db, t: TrainingFull): PersonScore[] {
  return participants(db, t).map((person) => {
    let weighted = 0;
    let weight = 0;
    let done = 0;

    for (const drill of t.drills) {
      const s = resultScore(drill, drill.results[person.id]);
      if (s === null) continue;
      weighted += s * drill.weight;
      weight += drill.weight;
      done++;
    }

    return {
      person,
      score: weight > 0 ? Math.round((100 * weighted) / weight) / 100 : null,
      done,
      total: t.drills.length,
    };
  });
}

export interface TrainingScore {
  /** The team's average, over the fighters who have any result. */
  team: number | null;
  scored: number;
  participants: number;
  /** Rounds fired and on target across every 'hits' drill. */
  shots: number;
  hits: number;
}

export function trainingScore(db: Db, t: TrainingFull): TrainingScore {
  const rows = scoresFor(db, t);
  const withScore = rows.filter((r) => r.score !== null);

  let shots = 0;
  let hits = 0;
  for (const drill of t.drills) {
    if (drill.kind !== 'hits') continue;
    for (const r of Object.values(drill.results)) {
      shots += r.shots ?? 0;
      hits += r.hits ?? 0;
    }
  }

  return {
    team: withScore.length
      ? Math.round((100 * withScore.reduce((s, r) => s + (r.score ?? 0), 0)) / withScore.length) / 100
      : null,
    scored: withScore.length,
    participants: rows.length,
    shots,
    hits,
  };
}

/** How a score reads on screen: 87 is not the same news as 42. */
export function scoreTone(score: number | null): 'good' | 'ok' | 'poor' | 'none' {
  if (score === null) return 'none';
  if (score >= 80) return 'good';
  if (score >= 60) return 'ok';
  return 'poor';
}

export const SCORE_COLOR: Record<ReturnType<typeof scoreTone>, string> = {
  good: 'var(--color-accent-200)',
  ok: 'var(--color-accent)',
  poor: 'var(--color-accent-300)',
  none: 'var(--color-neutral-500)',
};

export const DRILL_KINDS: { id: Drill['kind']; label: string; hint: string }[] = [
  { id: 'hits', label: 'ירי — כדורים ופגיעות', hint: 'הציון מחושב לבד: פגיעות חלקי כדורים' },
  { id: 'score', label: 'ציון ידני 0–100', hint: 'המדריך נותן ציון לפי ביצוע' },
  { id: 'passfail', label: 'עבר / לא עבר', hint: 'נשמר כ-100 או 0' },
];
