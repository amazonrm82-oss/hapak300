import { canDrive } from './alerts';
import { DEPARTURE_LEAD_MINUTES, GEAR_CATALOG } from './constants';
import { addDays, addMinutes, sundayOf } from './dates';
import { topicSafety } from './selectors';
import type { AmmoRow, Db, DayBlock, FireMode, FoodRow, GearItem, Person, RotationConfig, TrainingTeam, Vehicle } from './types';

/** Per-topic kit list: [item, quantity]. Falls back to a small default set. */
const GEAR_BY_TOPIC: Record<string, [string, number][]> = {
  setup: [
    ['אוהל חפ״ק ושולחנות', 2],
    ['גנרטור ותאורה', 1],
    ['מכשירי קשר', 6],
    ['מחשבים / מסכי שו״ב', 3],
    ['ציוד סימון משטח', 1],
    ['מפות ומצפנים', 4],
    ['ערכת חובש', 1],
  ],
  comms: [
    ['מכשירי קשר', 10],
    ['מחשבים / מסכי שו״ב', 3],
    ['גנרטור ותאורה', 1],
    ['ערכת חובש', 1],
  ],
  nav: [
    ['מפות ומצפנים', 10],
    ['מכשירי קשר', 4],
    ['ערכת חובש', 1],
    ['אפוד וקסדה', 10],
  ],
  fire: [
    ['אפוד וקסדה', 10],
    ['ערכת חובש', 1],
    ['מכשירי קשר', 2],
    ['ציוד סימון משטח', 1],
  ],
  drive: [
    ['מכשירי קשר', 4],
    ['ערכת חובש', 1],
    ['אפוד וקסדה', 10],
  ],
  medic: [
    ['ערכת חובש', 4],
    ['אפוד וקסדה', 10],
  ],
  secure: [
    ['אפוד וקסדה', 20],
    ['מכשירי קשר', 8],
    ['אמר״ל / משקפי לילה', 6],
    ['ערכת חובש', 2],
  ],
  night: [
    ['אמר״ל / משקפי לילה', 12],
    ['מכשירי קשר', 10],
    ['אוהל חפ״ק ושולחנות', 2],
    ['גנרטור ותאורה', 2],
    ['ערכת חובש', 2],
    ['מפות ומצפנים', 6],
  ],
  fitness: [
    ['ערכת חובש', 2],
    ['מכשירי קשר', 2],
  ],
  hq: [
    ['אוהל חפ״ק ושולחנות', 3],
    ['גנרטור ותאורה', 2],
    ['מחשבים / מסכי שו״ב', 6],
    ['מכשירי קשר', 12],
    ['מפות ומצפנים', 8],
    ['ערכת חובש', 2],
    ['אמר״ל / משקפי לילה', 8],
  ],
};

const FALLBACK_GEAR: [string, number][] = [
  [GEAR_CATALOG[0], 10],
  [GEAR_CATALOG[1], 4],
  [GEAR_CATALOG[4], 1],
];

export type NewGear = Omit<GearItem, 'id'>;
export type NewVehicle = Omit<Vehicle, 'id'>;
export type NewAmmo = Omit<AmmoRow, 'id'>;
export type NewFood = Omit<FoodRow, 'id'>;
export type NewDayBlock = Omit<DayBlock, 'id'>;

export function defaultGear(topicId: string): NewGear[] {
  return (GEAR_BY_TOPIC[topicId] || FALLBACK_GEAR).map(([name, qty]) => ({
    name,
    qty,
    returned: false,
    missing: '',
    owner_id: null,
  }));
}

const ammoRow = (weapon: string, total: number, perFighter = 0): NewAmmo => ({
  weapon,
  per_fighter: perFighter,
  allocated: total,
  used: 0,
});

export function defaultAmmo(topicId: string, n: number, mode: FireMode = 'wet'): NewAmmo[] {
  // A dry day draws nothing, and a partial day draws only what a partial day
  // fires. Anything else is an allocation somebody has to sign for and return.
  if (mode === 'dry') return [];
  if (mode === 'partial')
    return [ammoRow('חק״ם', 30 * n, 30), ammoRow('רימוני עשן', 6), ammoRow('סימונים / נורים', 6)];
  if (topicId === 'fire')
    return [
      ammoRow('M4 / תבור', 120 * n, 120),
      ammoRow('אקדח', 30 * n, 30),
      ammoRow('נגב', 400),
      ammoRow('מא״ג', 400),
      ammoRow('מטול רימונים', 6),
      ammoRow('רימוני רסס', 4),
      ammoRow('רימוני עשן', 6),
      ammoRow('סימונים / נורים', 10),
    ];
  if (topicId === 'hq')
    return [ammoRow('M4 / תבור', 30 * n, 30), ammoRow('רימוני עשן', 10), ammoRow('סימונים / נורים', 20)];
  if (['setup', 'secure', 'night', 'nav'].includes(topicId))
    return [ammoRow('רימוני עשן', 4), ammoRow('סימונים / נורים', 6)];
  return [];
}

export function defaultFood(topicId: string, n: number, atBase: boolean): NewFood[] {
  const jer = Math.ceil((n * 6) / 20);
  const rows: NewFood[] = [
    {
      name: atBase ? 'ארוחה חמה מהבסיס' : 'מנות קרב',
      qty: n + 2,
      unit: atBase ? 'מנות' : 'יח׳',
      note: '',
    },
    { name: 'מים', qty: jer * 20, unit: 'ליטר', note: `${jer} ג׳ריקנים` },
    { name: 'קפה וכיבוד', qty: n > 12 ? 2 : 1, unit: 'ערכות', note: '' },
  ];
  if (topicId === 'night' || topicId === 'hq')
    rows.push({ name: 'ארוחה חמה מהבסיס', qty: n, unit: 'מנות', note: 'ארוחת ערב בשטח' });
  return rows;
}

export function defaultVehicles(
  teamId: TrainingTeam,
  start: string,
  people: Person[],
  attendsAll: string[] = [],
  date = '',
): NewVehicle[] {
  // Only someone licensed on the day is proposed as a driver. Without this the
  // proposal could name a driver the database then refuses, and the training
  // would fail to save for a reason nobody could see on the form.
  const drivers = people.filter(
    (p) =>
      (p.is_driver || p.role === 'נהג') &&
      p.status === 'active' &&
      (!date || canDrive(p, date)) &&
      (teamId === 'joint'
        ? !!p.team_id
        : p.team_id === teamId || (p.team_id ? attendsAll.includes(p.team_id) : false)),
  );
  const dep = addMinutes(start, -DEPARTURE_LEAD_MINUTES);
  const types = teamId === 'joint' ? ['האמר', 'האמר', 'האמר', 'רוביקון', 'RZR'] : ['האמר', 'האמר', 'האמר'];
  // Never propose a vehicle nobody may drive. A row with an empty seat is a row
  // the commander then has to delete before the training will save, and the
  // proposal exists to save him work, not to make some.
  return types.slice(0, drivers.length).map((type, i) => ({
    type,
    tz: '',
    driver_id: drivers[i].id,
    seats: type === 'RZR' ? 4 : type === 'רוביקון' ? 5 : 6,
    departure: dep,
    fitness: 'כשיר' as const,
    fault: '',
  }));
}

/** The default day plan: seven blocks anchored to the start and end times. */
export function defaultDayBlocks(start: string, end: string, topicId: string): NewDayBlock[] {
  const b = (time: string, title: string): NewDayBlock => ({ time, title });
  const isNight = start > end; // the training runs past midnight
  return [
    b(start, 'התכנסות ומסדר'),
    b(addMinutes(start, 15), 'תדריך בטיחות'),
    b(addMinutes(start, 45), 'הדרכה'),
    b(addMinutes(start, 120), 'תרגול'),
    b(isNight ? addMinutes(start, 240) : '12:30', 'הפסקת אוכל'),
    b(isNight ? addMinutes(start, 285) : '13:15', topicId === 'hq' ? 'תרגול — שלב ב׳' : 'תרגול — המשך'),
    b(addMinutes(end, -75), 'סיכום ולקחים'),
    b(addMinutes(end, -45), 'החזרת ציוד וספירה'),
  ];
}

export interface DefaultLogistics {
  gear: NewGear[];
  ammo: NewAmmo[];
  vehicles: NewVehicle[];
  food: NewFood[];
}

export function defaultLogistics(
  topicId: string,
  teamId: TrainingTeam,
  start: string,
  people: Person[],
  location: string,
  attendsAll: string[] = [],
  date = '',
  mode: FireMode = 'wet',
): DefaultLogistics {
  // סדיר joins whatever א׳ or ב׳ are doing, so they count towards the food,
  // the seats and the ammunition for every training
  const roster = people.filter(
    (p) =>
      p.status === 'active' &&
      p.team_id &&
      (teamId === 'joint' || p.team_id === teamId || attendsAll.includes(p.team_id)),
  );
  const n = roster.length || (teamId === 'joint' ? 20 : 10);
  const atBase = /בסיס/.test(location || '');
  return {
    gear: defaultGear(topicId),
    ammo: defaultAmmo(topicId, n, mode),
    vehicles: defaultVehicles(teamId, start, people, attendsAll, date),
    food: defaultFood(topicId, n, atBase),
  };
}

/** First active instructor certified for this topic, if any. */
export function qualifiedInstructor(db: Db, topicId: string): string | null {
  const c = db.people.filter((p) => p.status === 'active' && p.is_instructor && p.qual.includes(topicId));
  return c.length ? c[0].id : null;
}

export interface RotationDraft {
  team_id: TrainingTeam;
  topic_id: string;
  date: string;
  start: string;
  end: string;
  location: string;
  commander_id: string | null;
  instructor_id: string | null;
  safety: string;
}

/**
 * The staged rotation: team A works through the topics in order, team B repeats
 * each one a week later (when `stagger` is on), then the joint weeks follow.
 * The certified instructor goes in as a pending invitation and the team
 * commander as training commander — both editable afterwards.
 */
export function generateRotation(db: Db, cfg: RotationConfig): RotationDraft[] {
  const base = sundayOf(cfg.start);
  const wd = Number(cfg.weekday) || 0;
  const out: RotationDraft[] = [];
  const topics = cfg.topics.length ? cfg.topics : db.topics.map((t) => t.id);
  const jt = cfg.joint_topics.length ? cfg.joint_topics : topics;

  const mk = (teamId: TrainingTeam, week: number, topicId: string) => {
    const date = addDays(base, (week - 1) * 7 + wd);
    const cmd =
      teamId === 'joint'
        ? db.teams.a.commander_id || db.teams.b.commander_id
        : db.teams[teamId].commander_id;
    out.push({
      team_id: teamId,
      topic_id: topicId,
      date,
      start: cfg.start_time,
      end: cfg.end_time,
      location: cfg.location,
      commander_id: cmd,
      instructor_id: qualifiedInstructor(db, topicId),
      safety: topicSafety(db, topicId),
    });
  };

  const tw = Number(cfg.team_weeks) || 0;
  const jw = Number(cfg.joint_weeks) || 0;
  const lag = cfg.stagger ? 1 : 0;

  for (let w = 1; w <= tw; w++) {
    mk('a', w, topics[(w - 1) % topics.length]);
    mk('b', w + lag, topics[(w - 1) % topics.length]);
  }
  for (let j = 1; j <= jw; j++) mk('joint', tw + lag + j, jt[(j - 1) % jt.length]);

  return out;
}
