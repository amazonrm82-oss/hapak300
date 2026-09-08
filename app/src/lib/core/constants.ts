import type { AttStatus, CertType, Fitness, TrainingStatus } from './types';

/**
 * Every rank in the army, highest first — the order is also the seniority used
 * to sort a roster (`RANK_ORDER`), so it must stay descending.
 *
 * Officers sit above the warrant officers (נגדים), who sit above the enlisted
 * ranks. A rank that is not on this list still works — `rankSort` puts it last
 * rather than failing — so nobody is blocked by an omission here.
 */
export const RANKS = [
  // קצינים
  'רא״ל',
  'אלוף',
  'תא״ל',
  'אל״ם',
  'סא״ל',
  'רס״ן',
  'סרן',
  'סגן',
  'סג״ם',
  // נגדים
  'רנ״ב',
  'רנ״מ',
  'רנ״ג',
  'רס״ב',
  'רס״ם',
  'רס״ר',
  'רס״ל',
  // חוגרים
  'סמ״ר',
  'סמל',
  'רב״ט',
  'טוראי',
] as const;

/** The full name behind each abbreviation, for the picker. */
export const RANK_FULL: Record<string, string> = {
  'רא״ל': 'רב אלוף',
  'תא״ל': 'תת אלוף',
  'אל״ם': 'אלוף משנה',
  'סא״ל': 'סגן אלוף',
  'רס״ן': 'רב סרן',
  'סג״ם': 'סגן משנה',
  'רנ״ב': 'רב נגד בכיר',
  'רנ״מ': 'רב נגד משנה',
  'רנ״ג': 'רב נגד',
  'רס״ב': 'רב סמל בכיר',
  'רס״ם': 'רב סמל מתקדם',
  'רס״ר': 'רב סמל ראשון',
  'רס״ל': 'רב סמל',
  'סמ״ר': 'סמל ראשון',
  'רב״ט': 'רב טוראי',
};

export const RANK_ORDER: Record<string, number> = Object.fromEntries(RANKS.map((r, i) => [r, i]));

// The job a person holds in the force. Distinct from the permission flags:
// "מפקד חפ״ק" here is the post, while the rights that come with it are the
// `is_hapak_commander` checkbox on the same form.
export const ROLES = [
  'מפקד צוות',
  'סמל צוות',
  'מפקד חפ״ק',
  'רס״פ',
  'קמב״צ',
  'קשר',
  'נהג',
  'חובש',
  'מאבטח',
  'נגביסט',
  'קלע',
  'מטוליסט',
  'מפק״ץ',
] as const;
export const ESSENTIAL_ROLES = ['חובש', 'נהג', 'מאבטח'] as const;

/**
 * The two posts that carry rights of their own, named once so the screens and
 * the database policies cannot drift apart on a spelling.
 *
 * The רס״פ runs the unit's equipment: the fleet, the catalogs and the logistics
 * of any training. The סמל צוות keeps the personal kit straight — weapon, its
 * serial and the certifications — on anyone's card, and nothing else.
 */
export const ROLE_RASAP = 'רס״פ';
export const ROLE_SERGEANT = 'סמל צוות';

export const WEAPONS = [
  'M4 / תבור',
  'נגב',
  'מא״ג',
  'אקדח',
  'מטול רימונים',
  'רימוני רסס',
  'רימוני עשן',
  'סימונים / נורים',
] as const;

/** Night-vision devices the unit holds. Free text is allowed — this is the shortcut. */
export const NVG_TYPES = [
  'אמר״ל 1×',
  'אמר״ל 4×',
  'משקפת לילה',
  'מצלמה תרמית',
  'כוונת לילה',
] as const;

export const VEHICLE_TYPES = [
  'האמר',
  'רוביקון',
  'RZR',
  'זאב',
  'סופה',
  'נגמ״ש',
  'רכב קשר',
  'משאית',
  'אופנוע',
  'אמבולנס',
] as const;

export const GEAR_CATALOG = [
  'אפוד וקסדה',
  'מכשירי קשר',
  'אמר״ל / משקפי לילה',
  'מפות ומצפנים',
  'ערכת חובש',
  'אוהל חפ״ק ושולחנות',
  'גנרטור ותאורה',
  'מחשבים / מסכי שו״ב',
  'ציוד סימון משטח',
] as const;

export const FOOD_CATALOG: { name: string; unit: string }[] = [
  { name: 'מנות קרב', unit: 'יח׳' },
  { name: 'ארוחה חמה מהבסיס', unit: 'מנות' },
  { name: 'קייטרינג', unit: 'מנות' },
  { name: 'מים', unit: 'ליטר' },
  { name: 'מים בג׳ריקנים', unit: 'ג׳ריקנים' },
  { name: 'קפה וכיבוד', unit: 'ערכות' },
  { name: 'כשרות / מגבלות תזונה', unit: 'מנות מיוחדות' },
];

export const ATT_STATUSES: { id: AttStatus; label: string }[] = [
  { id: 'coming', label: 'מגיע' },
  { id: 'late', label: 'מאחר' },
  { id: 'absent', label: 'לא מגיע' },
  { id: 'sick', label: 'חולה / גימלים' },
  { id: 'reserve', label: 'מילואים אחר' },
  { id: 'other', label: 'סיבה חופשית' },
];

export const STATUS_LABEL: Record<AttStatus, string> = Object.fromEntries(
  ATT_STATUSES.map((s) => [s.id, s.label]),
) as Record<AttStatus, string>;

export const DAY_BLOCK_TITLES = [
  'התכנסות ומסדר',
  'תדריך בטיחות',
  'הדרכה',
  'תרגול',
  'הפסקת אוכל',
  'סיכום ולקחים',
  'החזרת ציוד וספירה',
] as const;

export const TRAINING_STATUS: Record<TrainingStatus, string> = {
  published: 'מפורסם',
  planned: 'מתוכנן',
  cancelled: 'בוטל',
  done: 'הסתיים',
};

export const FITNESS_OPTIONS: Fitness[] = ['כשיר', 'טעון בדיקה', 'מושבת'];

export const WEEKDAYS: [string, string][] = [
  ['0', 'ראשון'],
  ['1', 'שני'],
  ['2', 'שלישי'],
  ['3', 'רביעי'],
  ['4', 'חמישי'],
  ['5', 'שישי'],
];

export const CERT_TYPES: [CertType, string][] = [
  ['fire', 'ירי (מטווח שנתי)'],
  ['drive', 'נהיגה מבצעית'],
  ['medic', 'עזרה ראשונה'],
  ['comms', 'קשר / שו״ב'],
  ['mildrive', 'נהג רכב צבאי'],
  ['medical', 'בדיקות רפואיות'],
];

/**
 * A driver has to hold one of these, in date.
 *
 * Unlike the topic gates below, this one blocks: a fighter without a licence in
 * date is not offered as a driver at all, and the database refuses him too.
 */
export const DRIVING_CERTS: readonly CertType[] = ['drive', 'mildrive'];

/** Topics that a personal certification gates — an expired one warns, never blocks. */
export const CERT_GATED_TOPICS = ['fire', 'drive', 'medic', 'comms'] as const;

export const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;

/** Default topic set with the per-topic safety-brief template. */
export const TOPICS: { id: string; name: string; safety: string }[] = [
  {
    id: 'setup',
    name: 'הקמת חפ״ק ופריסה',
    safety:
      'עבודה בזוגות בהקמת האוהל · חיבור גנרטור רק על ידי בעל הסמכה · הארקה לפני הפעלת מסכים · מים בהישג יד בכל עמדה.',
  },
  {
    id: 'comms',
    name: 'קשר ושו״ב',
    safety:
      'אין שידור ללא אישור קצין הקשר · שמירת משמעת רשת · חובה קסדה בעבודה על תרנים · ניתוק מצברים בסיום.',
  },
  {
    id: 'nav',
    name: 'ניווט וקריאת מפה',
    safety:
      'ניווט בזוגות בלבד · דיווח נצ״ד כל 30 דקות · 3 ליטר מים ללוחם · חובש עם רכב פינוי בציר המרכזי.',
  },
  {
    id: 'fire',
    name: 'ירי והכשרת נשק',
    safety:
      'מנהלת מטווח: רס״ר גיא ניסים · נשק פרוק וטעון רק בעמדה · קו ירי אחד · ״הפסק אש״ מכל לוחם · חובש בעמדת הפיקוד.',
  },
  {
    id: 'drive',
    name: 'נהיגה מבצעית',
    safety:
      'חגורות בכל נסיעה · מהירות עד 40 קמ״ש בשטח · מפקד רכב בכל רכב · תדריך מסלול לפני יציאה.',
  },
  {
    id: 'medic',
    name: 'עזרה ראשונה קרבית',
    safety:
      'תרגול חוסם עורקים עד 30 שניות בלבד · אין מחטים אמיתיות · ערכת חובש אמיתית נפרדת מציוד התרגול.',
  },
  {
    id: 'secure',
    name: 'אבטחת חפ״ק',
    safety:
      'נשק ללא מחסנית בתרגול · תיאום גזרות ירי · הבחנה בין כוח מתרגל לכוח מאבטח (סרטים).',
  },
  {
    id: 'night',
    name: 'ניוד חפ״ק בלילה',
    safety:
      'נסיעה עם אמר״ל בלבד באישור · מרחק 50 מ׳ בין רכבים · חובה פנס אדום · דיווח הגעה בכל נקודת עצירה.',
  },
  {
    id: 'fitness',
    name: 'כשירות גופנית',
    safety: 'שתייה לפני ואחרי · הפסקת פעילות מעל 32° · חובש נוכח · אין ריצה בכביש.',
  },
  {
    id: 'hq',
    name: 'תרגיל מפקדות',
    safety:
      'כל הוראות אימון ניוד ואבטחה חלות · מנוחה מינימלית 4 שעות · ניהול סיכונים של מפקד התרגיל לפני כל שלב.',
  },
];

/** Fixed holidays shown on the brigade calendar alongside the manually entered events. */
export const HOLIDAYS: Record<string, string> = {
  '2026-09-12': 'ראש השנה',
  '2026-09-13': 'ראש השנה',
  '2026-09-21': 'יום כיפור',
  '2026-09-26': 'סוכות',
  '2026-10-03': 'שמחת תורה',
  '2026-12-05': 'חנוכה · נר ראשון',
};

export const DEFAULT_FREQ = 'רשת חפ״ק: ערוץ 3 · חלופי: ערוץ 7';
export const DEFAULT_PICKUP = 'שער בסיס האם';
/** Departure is always 90 minutes before the training starts. */
export const DEPARTURE_LEAD_MINUTES = 90;
