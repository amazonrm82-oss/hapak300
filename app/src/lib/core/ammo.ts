import { personById } from './selectors';
import type { Db, TrainingFull } from './types';

/**
 * What the training actually fired, counted from the stations.
 *
 * Nobody counts rounds at the end of a range day; what does get written down is
 * how many each fighter fired at each station, because that is what the score
 * is made of. So the consumption is already in the system — it just has to be
 * added up.
 *
 * Rounds are attributed to the weapon the fighter carries, from his own card.
 * That is the only honest attribution available: a station has no weapon of its
 * own, and a fighter fires the weapon he holds. Anyone with no weapon on file is
 * counted separately rather than folded into a type he may not carry.
 */
export interface WeaponUsage {
  weapon: string;
  /** Rounds fired, summed from the stations. */
  fired: number;
  hits: number;
  /** How many fighters fired this weapon. */
  fighters: number;
  /** What the training set out with, from its ammunition plan. */
  allocated: number;
  /** What somebody wrote down by hand on the logistics tab, if anything. */
  recorded: number;
}

export interface DrillUsage {
  name: string;
  fired: number;
  hits: number;
  fighters: number;
}

export interface AmmoUsage {
  rows: WeaponUsage[];
  byDrill: DrillUsage[];
  fired: number;
  hits: number;
  allocated: number;
  recorded: number;
  /** Rounds fired by fighters with no weapon recorded on their card. */
  unassigned: number;
  /** True when the stations recorded no shooting at all. */
  empty: boolean;
}

const NO_WEAPON = 'ללא נשק רשום';

export function ammoUsage(db: Db, t: TrainingFull): AmmoUsage {
  const byWeapon = new Map<string, { fired: number; hits: number; fighters: Set<string> }>();
  const byDrill: DrillUsage[] = [];

  for (const drill of t.drills) {
    if (drill.kind !== 'hits') continue;
    let dFired = 0;
    let dHits = 0;
    let dFighters = 0;

    for (const [personId, r] of Object.entries(drill.results)) {
      const shots = r.shots ?? 0;
      if (shots <= 0) continue;
      const weapon = personById(db, personId)?.weapon?.trim() || NO_WEAPON;
      const bucket = byWeapon.get(weapon) ?? { fired: 0, hits: 0, fighters: new Set<string>() };
      bucket.fired += shots;
      bucket.hits += r.hits ?? 0;
      bucket.fighters.add(personId);
      byWeapon.set(weapon, bucket);

      dFired += shots;
      dHits += r.hits ?? 0;
      dFighters++;
    }

    if (dFired > 0) byDrill.push({ name: drill.name, fired: dFired, hits: dHits, fighters: dFighters });
  }

  // the plan, so the report can put the two side by side
  const planned = new Map<string, { allocated: number; recorded: number }>();
  for (const a of t.ammo) {
    const cur = planned.get(a.weapon) ?? { allocated: 0, recorded: 0 };
    cur.allocated += a.allocated ?? 0;
    cur.recorded += a.used ?? 0;
    planned.set(a.weapon, cur);
  }

  // every weapon that either fired or was planned for
  const names = [...new Set([...byWeapon.keys(), ...planned.keys()])].sort((a, b) => {
    const fa = byWeapon.get(a)?.fired ?? 0;
    const fb = byWeapon.get(b)?.fired ?? 0;
    return fb - fa || a.localeCompare(b, 'he');
  });

  const rows: WeaponUsage[] = names.map((weapon) => {
    const u = byWeapon.get(weapon);
    const p = planned.get(weapon);
    return {
      weapon,
      fired: u?.fired ?? 0,
      hits: u?.hits ?? 0,
      fighters: u?.fighters.size ?? 0,
      allocated: p?.allocated ?? 0,
      recorded: p?.recorded ?? 0,
    };
  });

  const sum = (pick: (r: WeaponUsage) => number) => rows.reduce((s, r) => s + pick(r), 0);

  return {
    rows,
    byDrill,
    fired: sum((r) => r.fired),
    hits: sum((r) => r.hits),
    allocated: sum((r) => r.allocated),
    recorded: sum((r) => r.recorded),
    unassigned: byWeapon.get(NO_WEAPON)?.fired ?? 0,
    empty: byDrill.length === 0,
  };
}
