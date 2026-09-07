// hapak-core.js — נתוני בסיס ולוגיקה עסקית של "כשירות חפ״ק מח״ט 300" (משותף לאתר ולאפליקציה)
export const DB_KEY = 'hapak300.db.v5';
export const SESSION_KEY = 'hapak300.session.v5';
export const PERIOD_START = '2026-09-20';
export const DEFAULT_TODAY = '2026-09-07';
let _start = PERIOD_START;
export function setPeriodStart(iso) { if (/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) _start = iso; }
export function getPeriodStart() { return _start; }
export const WEEKDAYS = [['0', 'ראשון'], ['1', 'שני'], ['2', 'שלישי'], ['3', 'רביעי'], ['4', 'חמישי'], ['5', 'שישי']];
export const CERT_TYPES = [['fire', 'ירי (מטווח שנתי)'], ['drive', 'נהיגה מבצעית'], ['medic', 'עזרה ראשונה'], ['comms', 'קשר / שו״ב'], ['mildrive', 'נהג רכב צבאי'], ['medical', 'בדיקות רפואיות']];
let _today = DEFAULT_TODAY, _now = '00:00', _db = null;
export function setToday(iso, hhmm) { if (/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) _today = iso; if (hhmm) _now = hhmm; }
export function realToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function hashPin(pin) { let h = 5381; const s = 'hapak300:' + pin; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(16); }

export const RANKS = ['אל״ם','סא״ל','רס״ן','סרן','סגן','סג״ם','רס״ר','רס״ל','סמ״ר','סמל','רב״ט','טוראי'];
const RANK_ORDER = Object.fromEntries(RANKS.map((r, i) => [r, i]));
export const ROLES = ['מפקד צוות','קמב״צ','קשר','נהג','חובש','מאבטח'];
export const ESSENTIAL_ROLES = ['חובש','נהג','מאבטח'];
export const WEAPONS = ['M4 / תבור','נגב','מא״ג','אקדח','מטול רימונים','רימוני רסס','רימוני עשן','סימונים / נורים'];
export const VEHICLE_TYPES = ['האמר','רוביקון','RZR','זאב','סופה','נגמ״ש','רכב קשר','משאית','אופנוע','אמבולנס'];
export const GEAR_CATALOG = ['אפוד וקסדה','מכשירי קשר','אמר״ל / משקפי לילה','מפות ומצפנים','ערכת חובש','אוהל חפ״ק ושולחנות','גנרטור ותאורה','מחשבים / מסכי שו״ב','ציוד סימון משטח'];
export const FOOD_CATALOG = [
  { name: 'מנות קרב', unit: 'יח׳' }, { name: 'ארוחה חמה מהבסיס', unit: 'מנות' }, { name: 'קייטרינג', unit: 'מנות' },
  { name: 'מים', unit: 'ליטר' }, { name: 'מים בג׳ריקנים', unit: 'ג׳ריקנים' }, { name: 'קפה וכיבוד', unit: 'ערכות' },
  { name: 'כשרות / מגבלות תזונה', unit: 'מנות מיוחדות' },
];
export const ATT_STATUSES = [
  { id: 'coming', label: 'מגיע' }, { id: 'late', label: 'מאחר' }, { id: 'absent', label: 'לא מגיע' },
  { id: 'sick', label: 'חולה / גימלים' }, { id: 'reserve', label: 'מילואים אחר' }, { id: 'other', label: 'סיבה חופשית' },
];
export const STATUS_LABEL = Object.fromEntries(ATT_STATUSES.map(s => [s.id, s.label]));
export const DAY_BLOCKS = ['התכנסות ומסדר','תדריך בטיחות','הדרכה','תרגול','הפסקת אוכל','סיכום ולקחים','החזרת ציוד וספירה'];
export const TRAINING_STATUS = { published: 'מפורסם', planned: 'מתוכנן', cancelled: 'בוטל', done: 'הסתיים', draft: 'טיוטה' };

export const TOPICS = [
  { id: 'setup', name: 'הקמת חפ״ק ופריסה', safety: 'עבודה בזוגות בהקמת האוהל · חיבור גנרטור רק על ידי בעל הסמכה · הארקה לפני הפעלת מסכים · מים בהישג יד בכל עמדה.' },
  { id: 'comms', name: 'קשר ושו״ב', safety: 'אין שידור ללא אישור קצין הקשר · שמירת משמעת רשת · חובה קסדה בעבודה על תרנים · ניתוק מצברים בסיום.' },
  { id: 'nav', name: 'ניווט וקריאת מפה', safety: 'ניווט בזוגות בלבד · דיווח נצ״ד כל 30 דקות · 3 ליטר מים ללוחם · חובש עם רכב פינוי בציר המרכזי.' },
  { id: 'fire', name: 'ירי והכשרת נשק', safety: 'מנהלת מטווח: רס״ר גיא ניסים · נשק פרוק וטעון רק בעמדה · קו ירי אחד · ״הפסק אש״ מכל לוחם · חובש בעמדת הפיקוד.' },
  { id: 'drive', name: 'נהיגה מבצעית', safety: 'חגורות בכל נסיעה · מהירות עד 40 קמ״ש בשטח · מפקד רכב בכל רכב · תדריך מסלול לפני יציאה.' },
  { id: 'medic', name: 'עזרה ראשונה קרבית', safety: 'תרגול חוסם עורקים עד 30 שניות בלבד · אין מחטים אמיתיות · ערכת חובש אמיתית נפרדת מציוד התרגול.' },
  { id: 'secure', name: 'אבטחת חפ״ק', safety: 'נשק ללא מחסנית בתרגול · תיאום גזרות ירי · הבחנה בין כוח מתרגל לכוח מאבטח (סרטים).' },
  { id: 'night', name: 'ניוד חפ״ק בלילה', safety: 'נסיעה עם אמר״ל בלבד באישור · מרחק 50 מ׳ בין רכבים · חובה פנס אדום · דיווח הגעה בכל נקודת עצירה.' },
  { id: 'fitness', name: 'כשירות גופנית', safety: 'שתייה לפני ואחרי · הפסקת פעילות מעל 32° · חובש נוכח · אין ריצה בכביש.' },
  { id: 'hq', name: 'תרגיל מפקדות', safety: 'כל הוראות אימון ניוד ואבטחה חלות · מנוחה מינימלית 4 שעות · ניהול סיכונים של מפקד התרגיל לפני כל שלב.' },
];

// ── תאריכים ─────────────────────────────────────────────────────────────────
export const DAY_LETTERS = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];
export const pad = n => String(n).padStart(2, '0');
export function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function toISO(d) { return d.toISOString().slice(0, 10); }
export function addDays(iso, n) { const d = parseISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
export function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
export function dayLetter(iso) { return DAY_LETTERS[parseISO(iso).getUTCDay()]; }
export function fmtShort(iso) { const d = parseISO(iso); return `${d.getUTCDate()}.${d.getUTCMonth() + 1}`; }
export function fmtFull(iso) { const d = parseISO(iso); return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`; }
export function weekOf(iso) { return Math.floor(daysBetween(_start, iso) / 7) + 1; }
export function weekStart(n) { return addDays(_start, (n - 1) * 7); }
export function sundayOf(iso) { return addDays(iso, -parseISO(iso).getUTCDay()); }
export function weekRange(n) { const s = weekStart(n); return `${fmtShort(s)}–${fmtShort(addDays(s, 6))}`; }
export function addMinutes(hhmm, mins) { const [h, m] = hhmm.split(':').map(Number); const t = ((h * 60 + m + mins) % 1440 + 1440) % 1440; return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; }
export function relDays(today, iso) {
  const d = daysBetween(today, iso);
  if (d === 0) return 'היום'; if (d === 1) return 'מחר'; if (d > 1) return `בעוד ${d} ימים`; if (d === -1) return 'אתמול'; return `לפני ${-d} ימים`;
}
export function dateLine(t) { const base = `יום ${dayLetter(t.date)} ${fmtFull(t.date)} · ${t.start}–${t.end}`; return t.endDate ? `${base} (${fmtShort(t.endDate)})` : base; }
export function isValidDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseISO(s).getTime()); }
export function isValidTime(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }

export function sunTimes(iso, lat = 32.08, lon = 34.78) {
  const d = parseISO(iso); const y = d.getUTCFullYear();
  const doy = Math.floor((d - Date.UTC(y, 0, 0)) / 86400000);
  const tz = iso < '2026-10-25' ? 3 : 2; // סיום שעון קיץ 25.10.2026
  const rad = Math.PI / 180;
  const calc = rising => {
    const lngHour = lon / 15; const t = doy + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634; L = (L + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad; RA = (RA + 360) % 360;
    RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
    const sinDec = 0.39782 * Math.sin(L * rad); const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    let H = rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad; H /= 15;
    const T = H + RA - 0.06571 * t - 6.622; const UT = (T - lngHour + 24) % 24; const local = (UT + tz + 24) % 24;
    return `${pad(Math.floor(local))}:${pad(Math.round((local % 1) * 60) % 60)}`;
  };
  return { rise: calc(true), set: calc(false) };
}
export function weatherFor(iso) {
  const m = parseISO(iso).getUTCMonth(); const day = parseISO(iso).getUTCDate();
  const base = { 8: [31, 21], 9: [28, 18], 10: [23, 14], 11: [19, 10] }[m] || [22, 13];
  const conds = ['בהיר', 'מעונן חלקית', 'בהיר', 'רוחות מזרחיות', 'מעונן', 'בהיר'];
  return { hi: base[0] - (day % 3), lo: base[1] - (day % 2), text: conds[day % conds.length] };
}
export function initials(name) { const p = name.trim().split(/\s+/); return p.length > 1 ? `${p[0][0]}.${p[1][0]}` : p[0].slice(0, 2); }
export function fullName(p) { return p ? `${p.rank} ${p.name}` : '—'; }
export function uid(prefix = 'x') { return prefix + '_' + Math.random().toString(36).slice(2, 8); }
export function rankSort(a, b) { return (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99) || a.name.localeCompare(b.name, 'he'); }

// ── נתוני בסיס ───────────────────────────────────────────────────────────────
const person = (id, teamId, rank, name, role, pn, phone, extra = {}) => ({
  id, teamId, rank, name, role, pn, phone, status: 'active', statusNote: '', rating: 7, qual: [],
  isTeamCommander: false, isInstructor: false, isAdmin: false, isHapakCommander: false,
  notif: { evening: true, morning: true, approved: true, changed: true }, ...extra,
});

function seedPeople() {
  return [
    person('p_adm', null, 'רס״ן', 'אורי כהן', 'מנהל מערכת', '5001234', '052-000-0001', { isAdmin: true, rating: 9 }),
    person('p_hq', null, 'סא״ל', 'ניר אלון', 'מפקד החפ״ק', '5002345', '052-000-0002', { isHapakCommander: true, isInstructor: true, qual: ['hq'], rating: 9 }),
    person('p_a1', 'a', 'סרן', 'יואב ברק', 'מפקד צוות', '7241938', '052-111-1001', { isTeamCommander: true, rating: 9 }),
    person('p_a2', 'a', 'סגן', 'נועה אדלר', 'קמב״צ', '7302214', '052-111-1002', { isInstructor: true, qual: ['nav', 'night'], rating: 8 }),
    person('p_a3', 'a', 'סמ״ר', 'עומר לוי', 'קשר', '7418836', '052-111-1003', { isInstructor: true, qual: ['comms'], rating: 8 }),
    person('p_a4', 'a', 'סמל', 'איתי רוזן', 'חובש', '7455120', '052-111-1004', { isInstructor: true, qual: ['medic'], rating: 7 }),
    person('p_a5', 'a', 'סמל', 'דניאל כץ', 'נהג', '7466718', '052-111-1005', { isInstructor: true, qual: ['drive'], rating: 7 }),
    person('p_a6', 'a', 'סמל', 'תומר גל', 'מאבטח', '7480932', '052-111-1006', { isInstructor: true, qual: ['fitness'], rating: 6 }),
    person('p_a7', 'a', 'רב״ט', 'עידו מור', 'נהג', '7512204', '052-111-1007', { rating: 6 }),
    person('p_a8', 'a', 'רב״ט', 'שי פרידמן', 'קשר', '7523310', '052-111-1008', { rating: 7 }),
    person('p_a9', 'a', 'רב״ט', 'ליאב אשכנזי', 'מאבטח', '7534421', '052-111-1009', { rating: 6 }),
    person('p_a10', 'a', 'סמ״ר', 'רון אביב', 'מאבטח', '7398871', '052-111-1010', { rating: 8 }),
    person('p_b1', 'b', 'סרן', 'נדב שרון', 'מפקד צוות', '7315502', '052-222-2001', { isTeamCommander: true, rating: 8 }),
    person('p_b2', 'b', 'סגן', 'מאיה הדר', 'קמב״צ', '7320917', '052-222-2002', { rating: 8 }),
    person('p_b3', 'b', 'רס״ל', 'אבי שמעוני', 'קשר', '7188805', '052-222-2003', { isInstructor: true, qual: ['setup', 'secure'], rating: 9 }),
    person('p_b4', 'b', 'רס״ר', 'גיא ניסים', 'מאבטח', '7150442', '052-222-2004', { isInstructor: true, qual: ['fire'], rating: 8 }),
    person('p_b5', 'b', 'סמ״ר', 'ליאור פרץ', 'קשר', '7440118', '052-222-2005', { rating: 7 }),
    person('p_b6', 'b', 'סמל', 'אלון מזרחי', 'נהג', '7461827', '052-222-2006', { isInstructor: true, qual: ['drive'], rating: 7 }),
    person('p_b7', 'b', 'סמל', 'רועי כהן', 'חובש', '7472236', '052-222-2007', { rating: 6 }),
    person('p_b8', 'b', 'רב״ט', 'יונתן ביטון', 'מאבטח', '7506610', '052-222-2008', { rating: 6 }),
    person('p_b9', 'b', 'רב״ט', 'עמית סבג', 'נהג', '7518823', '052-222-2009', { rating: 5 }),
    person('p_b10', 'b', 'רב״ט', 'אורן חן', 'מאבטח', '7529931', '052-222-2010', { rating: 7 }),
  ];
}

const GEAR_BY_TOPIC = {
  setup: [['אוהל חפ״ק ושולחנות', 2], ['גנרטור ותאורה', 1], ['מכשירי קשר', 6], ['מחשבים / מסכי שו״ב', 3], ['ציוד סימון משטח', 1], ['מפות ומצפנים', 4], ['ערכת חובש', 1]],
  comms: [['מכשירי קשר', 10], ['מחשבים / מסכי שו״ב', 3], ['גנרטור ותאורה', 1], ['ערכת חובש', 1]],
  nav: [['מפות ומצפנים', 10], ['מכשירי קשר', 4], ['ערכת חובש', 1], ['אפוד וקסדה', 10]],
  fire: [['אפוד וקסדה', 10], ['ערכת חובש', 1], ['מכשירי קשר', 2], ['ציוד סימון משטח', 1]],
  drive: [['מכשירי קשר', 4], ['ערכת חובש', 1], ['אפוד וקסדה', 10]],
  medic: [['ערכת חובש', 4], ['אפוד וקסדה', 10]],
  secure: [['אפוד וקסדה', 20], ['מכשירי קשר', 8], ['אמר״ל / משקפי לילה', 6], ['ערכת חובש', 2]],
  night: [['אמר״ל / משקפי לילה', 12], ['מכשירי קשר', 10], ['אוהל חפ״ק ושולחנות', 2], ['גנרטור ותאורה', 2], ['ערכת חובש', 2], ['מפות ומצפנים', 6]],
  fitness: [['ערכת חובש', 2], ['מכשירי קשר', 2]],
  hq: [['אוהל חפ״ק ושולחנות', 3], ['גנרטור ותאורה', 2], ['מחשבים / מסכי שו״ב', 6], ['מכשירי קשר', 12], ['מפות ומצפנים', 8], ['ערכת חובש', 2], ['אמר״ל / משקפי לילה', 8]],
};
const ammoRow = (weapon, total, perFighter = 0) => ({ id: uid('am'), weapon, perFighter, allocated: total, used: 0 });
function defaultAmmo(topicId, n) {
  if (topicId === 'fire') return [ammoRow('M4 / תבור', 120 * n, 120), ammoRow('אקדח', 30 * n, 30), ammoRow('נגב', 400), ammoRow('מא״ג', 400), ammoRow('מטול רימונים', 6), ammoRow('רימוני רסס', 4), ammoRow('רימוני עשן', 6), ammoRow('סימונים / נורים', 10)];
  if (topicId === 'hq') return [ammoRow('M4 / תבור', 30 * n, 30), ammoRow('רימוני עשן', 10), ammoRow('סימונים / נורים', 20)];
  if (['setup', 'secure', 'night', 'nav'].includes(topicId)) return [ammoRow('רימוני עשן', 4), ammoRow('סימונים / נורים', 6)];
  return [];
}
function defaultFood(topicId, n, atBase) {
  const jer = Math.ceil(n * 6 / 20);
  const rows = [{ id: uid('fd'), name: atBase ? 'ארוחה חמה מהבסיס' : 'מנות קרב', qty: n + 2, unit: atBase ? 'מנות' : 'יח׳', note: '' },
    { id: uid('fd'), name: 'מים', qty: jer * 20, unit: 'ליטר', note: `${jer} ג׳ריקנים` },
    { id: uid('fd'), name: 'קפה וכיבוד', qty: n > 12 ? 2 : 1, unit: 'ערכות', note: '' }];
  if (topicId === 'night' || topicId === 'hq') rows.push({ id: uid('fd'), name: 'ארוחה חמה מהבסיס', qty: n, unit: 'מנות', note: 'ארוחת ערב בשטח' });
  return rows;
}
function defaultGear(topicId) { return (GEAR_BY_TOPIC[topicId] || [['אפוד וקסדה', 10], ['מכשירי קשר', 4], ['ערכת חובש', 1]]).map(([name, qty]) => ({ id: uid('gr'), name, qty, returned: false, missing: '', ownerId: null })); }
function defaultVehicles(teamId, start, people) {
  const drivers = people.filter(p => p.role === 'נהג' && (teamId === 'joint' ? true : p.teamId === teamId));
  const dep = addMinutes(start, -90);
  const tz = teamId === 'a' ? ['612345', '612402', '613118'] : teamId === 'b' ? ['620771', '620915', '621340'] : ['612345', '612402', '620771', '701122', '702310'];
  const types = teamId === 'joint' ? ['האמר', 'האמר', 'האמר', 'רוביקון', 'RZR'] : ['האמר', 'האמר', 'האמר'];
  return types.map((type, i) => ({ id: uid('vh'), type, tz: tz[i], driverId: drivers[i]?.id || null, seats: type === 'RZR' ? 4 : type === 'רוביקון' ? 5 : 6, departure: dep, fitness: tz[i] === '613118' ? 'טעון בדיקה' : 'כשיר', fault: '' }));
}
export function defaultDayBlocks(start, end, topicId) {
  const b = (time, title) => ({ id: uid('bl'), time, title });
  const isNight = start > end;
  return [b(start, 'התכנסות ומסדר'), b(addMinutes(start, 15), 'תדריך בטיחות'), b(addMinutes(start, 45), 'הדרכה'), b(addMinutes(start, 120), 'תרגול'),
    b(isNight ? addMinutes(start, 240) : '12:30', 'הפסקת אוכל'), b(isNight ? addMinutes(start, 285) : '13:15', topicId === 'hq' ? 'תרגול — שלב ב׳' : 'תרגול — המשך'),
    b(addMinutes(end, -75), 'סיכום ולקחים'), b(addMinutes(end, -45), 'החזרת ציוד וספירה')];
}
export function defaultLogistics(topicId, teamId, start, people, location) {
  const n = teamId === 'joint' ? 20 : 10;
  const atBase = /בסיס/.test(location || '');
  return { gear: defaultGear(topicId), ammo: defaultAmmo(topicId, n), vehicles: defaultVehicles(teamId, start, people), food: defaultFood(topicId, n, atBase) };
}
export function topicSafety(topicId) { return (TOPICS.find(t => t.id === topicId) || {}).safety || ''; }

function seedTrainings(people) {
  const mk = (o) => {
    const t = {
      id: o.id, seq: o.seq, teamId: o.teamId, topicId: o.topicId, date: o.date, endDate: o.endDate || null, start: o.start, end: o.end,
      location: o.location, coords: o.coords, instructorId: o.instructorId, commanderId: o.commanderId,
      instStatus: o.instStatus || 'pending', cmdStatus: o.cmdStatus || 'pending', status: o.status || 'planned',
      freq: 'רשת חפ״ק: ערוץ 3 · חלופי: ערוץ 7', safety: topicSafety(o.topicId), pickup: 'שער בסיס האם', departure: addMinutes(o.start, -90),
      medicId: o.teamId === 'b' ? 'p_b7' : 'p_a4', orderFile: null, notes: o.notes || '',
      dayBlocks: defaultDayBlocks(o.start, o.end, o.topicId),
      ...defaultLogistics(o.topicId, o.teamId, o.start, people, o.location),
      attendance: o.attendance || {}, trainerSummarized: false, approvedAll: false, approvalLog: [],
      ammoSigned: false, chat: o.chat || [], summary: { commander: '', instructor: '', keep: '', improve: '', photos: [] },
      cancelReason: '', createdAt: '2026-09-01', updatedAt: '2026-09-05',
    };
    t.evacVehicleId = t.vehicles[0]?.id || null;
    return t;
  };
  const att = (arr) => Object.fromEntries(arr.map(([pid, status, reason, time]) => [pid, { status, reason: reason || '', time: time || '2026-09-06 19:40', approved: false, approvedBy: null, rating: null }]));
  const msg = (author, text, time, extra = {}) => ({ id: uid('m'), authorId: author, text, time, pinned: false, readBy: [author], attachment: null, ...extra });
  return [
    mk({ id: 't_a1', seq: 1, teamId: 'a', topicId: 'setup', date: '2026-09-23', start: '07:00', end: '17:00', location: 'שטח אימונים ״רמה״', coords: '234700 652100', instructorId: 'p_b3', commanderId: 'p_a2', instStatus: 'accepted', cmdStatus: 'accepted', status: 'published',
      attendance: att([['p_a1', 'coming'], ['p_a2', 'coming'], ['p_a3', 'coming'], ['p_a4', 'coming'], ['p_a5', 'coming'], ['p_a6', 'coming'], ['p_a7', 'reserve', 'שירות מילואים בגדוד 9203 עד 25.9']]),
      chat: [msg('p_a2', 'יציאה 05:30 משער בסיס האם. מגיעים עם ציוד מלא, אפוד וקסדה. מי שצריך הסעה מהצומת — לכתוב לי.', '2026-09-05 21:14', { pinned: true, readBy: ['p_a2', 'p_a1', 'p_a3', 'p_a4', 'p_a6'] }),
        msg('p_a3', 'אני מושך את מכשירי הקשר מהמחסן ביום ג׳ אחה״צ, צריך עוד זוג ידיים.', '2026-09-06 08:02', { readBy: ['p_a3', 'p_a2', 'p_a1'] }),
        msg('p_b3', 'תדריך בטיחות ב-07:15 בדיוק. נתחיל בהקמה יבשה ואז עם גנרטור.', '2026-09-06 12:30', { readBy: ['p_b3', 'p_a2'] })] }),
    mk({ id: 't_a2', seq: 2, teamId: 'a', topicId: 'comms', date: '2026-09-29', start: '08:00', end: '16:00', location: 'בסיס האם · חדר שו״ב', coords: '187300 668900', instructorId: 'p_a3', commanderId: 'p_a1', instStatus: 'accepted', cmdStatus: 'accepted', status: 'published',
      attendance: att([['p_a1', 'coming'], ['p_a3', 'coming'], ['p_a8', 'coming']]) }),
    mk({ id: 't_a3', seq: 3, teamId: 'a', topicId: 'nav', date: '2026-10-08', start: '06:00', end: '15:00', location: 'גזרת ״הר שחר״', coords: '241900 659300', instructorId: 'p_a2', commanderId: 'p_a1', instStatus: 'accepted', cmdStatus: 'accepted', status: 'published' }),
    mk({ id: 't_a4', seq: 4, teamId: 'a', topicId: 'fire', date: '2026-10-14', start: '07:00', end: '17:00', location: 'מטווח החטיבה', coords: '190200 665400', instructorId: 'p_b4', commanderId: 'p_a2', instStatus: 'pending', cmdStatus: 'accepted' }),
    mk({ id: 't_a5', seq: 5, teamId: 'a', topicId: 'drive', date: '2026-10-20', start: '07:00', end: '17:00', location: 'מסלול ״ואדי״', coords: '236100 649800', instructorId: 'p_a5', commanderId: 'p_a1', instStatus: 'declined', cmdStatus: 'accepted' }),
    mk({ id: 't_a6', seq: 6, teamId: 'a', topicId: 'medic', date: '2026-10-28', start: '08:00', end: '16:00', location: 'בסיס האם · כיתת הדרכה', coords: '187300 668900', instructorId: 'p_a4', commanderId: 'p_a2', instStatus: 'pending', cmdStatus: 'pending' }),
    mk({ id: 't_b1', seq: 1, teamId: 'b', topicId: 'setup', date: '2026-09-30', start: '07:00', end: '17:00', location: 'שטח אימונים ״רמה״', coords: '234700 652100', instructorId: 'p_b3', commanderId: 'p_b2', instStatus: 'accepted', cmdStatus: 'accepted', status: 'published',
      attendance: att([['p_b1', 'coming'], ['p_b2', 'coming'], ['p_b3', 'coming'], ['p_b7', 'coming']]) }),
    mk({ id: 't_b2', seq: 2, teamId: 'b', topicId: 'comms', date: '2026-10-06', start: '08:00', end: '16:00', location: 'בסיס האם · חדר שו״ב', coords: '187300 668900', instructorId: 'p_a3', commanderId: 'p_b1', instStatus: 'accepted', cmdStatus: 'accepted', status: 'published' }),
    mk({ id: 't_b3', seq: 3, teamId: 'b', topicId: 'nav', date: '2026-10-15', start: '06:00', end: '15:00', location: 'גזרת ״הר שחר״', coords: '241900 659300', instructorId: 'p_a2', commanderId: 'p_b2', instStatus: 'accepted', cmdStatus: 'accepted', status: 'published' }),
    mk({ id: 't_b4', seq: 4, teamId: 'b', topicId: 'fire', date: '2026-10-21', start: '07:00', end: '17:00', location: 'מטווח החטיבה', coords: '190200 665400', instructorId: 'p_b4', commanderId: 'p_b1', instStatus: 'pending', cmdStatus: 'accepted' }),
    mk({ id: 't_b5', seq: 5, teamId: 'b', topicId: 'drive', date: '2026-10-29', start: '07:00', end: '17:00', location: 'מסלול ״ואדי״', coords: '236100 649800', instructorId: 'p_b6', commanderId: 'p_b2', instStatus: 'pending', cmdStatus: 'pending' }),
    mk({ id: 't_b6', seq: 6, teamId: 'b', topicId: 'medic', date: '2026-11-03', start: '08:00', end: '16:00', location: 'בסיס האם · כיתת הדרכה', coords: '187300 668900', instructorId: 'p_a4', commanderId: 'p_b1', instStatus: 'pending', cmdStatus: 'pending' }),
    mk({ id: 't_j1', seq: 1, teamId: 'joint', topicId: 'secure', date: '2026-11-11', start: '07:00', end: '17:00', location: 'שטח אימונים ״רמה״', coords: '234700 652100', instructorId: 'p_b3', commanderId: 'p_a1', instStatus: 'accepted', cmdStatus: 'accepted' }),
    mk({ id: 't_j2', seq: 2, teamId: 'joint', topicId: 'night', date: '2026-11-18', start: '16:00', end: '02:00', location: 'גזרת ״הר שחר״', coords: '241900 659300', instructorId: 'p_a2', commanderId: 'p_b1', instStatus: 'pending', cmdStatus: 'accepted' }),
    mk({ id: 't_j3', seq: 3, teamId: 'joint', topicId: 'fitness', date: '2026-11-26', start: '06:00', end: '12:00', location: 'בסיס האם · מגרש', coords: '187300 668900', instructorId: 'p_a6', commanderId: 'p_b2', instStatus: 'pending', cmdStatus: 'pending' }),
    mk({ id: 't_j4', seq: 4, teamId: 'joint', topicId: 'hq', date: '2026-12-01', endDate: '2026-12-02', start: '06:00', end: '14:00', location: 'שטח אימונים ״רמה״', coords: '234700 652100', instructorId: 'p_hq', commanderId: 'p_a1', instStatus: 'accepted', cmdStatus: 'accepted', notes: 'בהשתתפות המח״ט, אל״ם דורון פלד' }),
  ];
}

export function buildDemo() {
  const people = seedPeople();
  return {
    version: 5,
    settings: { appName: 'כשירות חפ״ק מח״ט 300', unitName: 'חפ״ק מח״ט 300', brigadeCommander: 'אל״ם דורון פלד', periodStart: PERIOD_START, periodName: 'חורף 2026', allowJoin: true, realMode: false, certAlertDays: 30, summaryLockDays: 7, minAttendance: 6, essentialRoles: [...ESSENTIAL_ROLES], inviteHours: 48, eveningReminder: '18:00', morningReminderBefore: 120, approvalWindowHours: 48 },
    teams: { a: { id: 'a', name: 'צוות א׳', commanderId: 'p_a1' }, b: { id: 'b', name: 'צוות ב׳', commanderId: 'p_b1' } },
    topics: TOPICS.map(t => ({ ...t })),
    gearCatalog: [...GEAR_CATALOG], vehicleTypes: [...VEHICLE_TYPES], weapons: [...WEAPONS], locations: ['שטח אימונים ״רמה״', 'בסיס האם · חדר שו״ב', 'גזרת ״הר שחר״', 'מטווח החטיבה', 'מסלול ״ואדי״', 'בסיס האם · כיתת הדרכה', 'בסיס האם · מגרש'],
    people, trainings: seedTrainings(people),
    joinRequests: [{ id: 'jr_1', name: 'גל ברוך', rank: 'רב״ט', role: 'מאבטח', pn: '7601234', phone: '052-333-3001', teamId: 'b', status: 'pending', at: '2026-09-06 17:20' }],
    notifications: [
      { id: 'n_1', text: 'סמל דניאל כץ דחה את ההזמנה להדריך ״נהיגה מבצעית״ (צוות א׳ · אימון 05). המערכת מציעה מחליף.', time: '2026-09-06 16:05', read: false, to: ['p_a1', 'p_adm'], tid: 't_a5' },
      { id: 'n_2', text: 'נוכחות לאימון 01 של צוות א׳ (הקמת חפ״ק ופריסה, 23.9) פתוחה לסימון.', time: '2026-09-05 18:00', read: false, to: null, tid: 't_a1' },
      { id: 'n_3', text: 'בקשת הצטרפות חדשה: רב״ט גל ברוך (7601234) לצוות ב׳ — ממתינה לאישור.', time: '2026-09-06 17:20', read: false, to: ['p_adm', 'p_hq'], tid: null },
      { id: 'n_4', text: 'הזמנה: רס״ר גיא ניסים הוזמן להדריך ״ירי והכשרת נשק״ (צוות א׳ · אימון 04, 14.10). ממתין לאישור עד 48 שעות.', time: '2026-09-04 10:12', read: true, to: ['p_a2', 'p_b4', 'p_adm'], tid: 't_a4' },
    ],
  };
}

// ── אחסון ────────────────────────────────────────────────────────────────────
// מצב התחלתי להפעלה: מנהל המערכת ומפקד החפ״ק בלבד, בלי אימונים — הצוותים והתבנית מוזנים במסך הניהול.
export function buildSeed() {
  const demo = buildDemo();
  return { ...demo, version: 5, settings: { ...demo.settings, realMode: true }, teams: { a: { id: 'a', name: 'צוות א׳', commanderId: null }, b: { id: 'b', name: 'צוות ב׳', commanderId: null } },
    people: [person('p_adm', null, 'רס״ן', 'מתן זזון', 'מנהל מערכת', '8409505', '052-5621437', { isAdmin: true, rating: 10, pin: null, certs: {} }), person('p_hq', null, 'סרן', 'ישראל קדוש', 'מפקד החפ״ק', '7387250', '058-5455567', { isHapakCommander: true, rating: 10, pin: null, certs: {} })],
    trainings: [], joinRequests: [], notifications: [], calendar: [], remindersSent: {} };
}
export function loadDB() {
  try { const raw = localStorage.getItem(DB_KEY); if (raw) { const db = JSON.parse(raw); if (db && db.version === 5) { migrate(db); _db = db; return db; } } } catch (e) { /* ignore */ }
  const db = buildSeed(); saveDB(db); return db;
}
function migrate(db) { const s = db.settings; if (!s.periodStart) s.periodStart = PERIOD_START; if (!s.periodName) s.periodName = 'חורף 2026'; if (s.allowJoin === undefined) s.allowJoin = true; if (s.realMode === undefined) s.realMode = true; if (!s.certAlertDays) s.certAlertDays = 30; if (!s.summaryLockDays) s.summaryLockDays = 7; db.calendar = db.calendar || []; db.remindersSent = db.remindersSent || {}; db.people.forEach(p => { if (p.pin === undefined) p.pin = null; if (!p.certs) p.certs = {}; }); db.trainings.forEach(t => { if (!t.feedback) t.feedback = {}; }); normalizePeriod(db); renumber(db); }
export function saveDB(db) { try { normalizePeriod(db); renumber(db); _db = db; localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* ignore */ } }
export function normalizePeriod(db) { const s = db.settings; if (!isValidDate(s.periodStart || '')) s.periodStart = PERIOD_START; s.periodStart = sundayOf(s.periodStart); const earliest = db.trainings.filter(t => t.status !== 'cancelled').map(t => t.date).sort()[0]; if (earliest && earliest < s.periodStart) s.periodStart = sundayOf(earliest); setPeriodStart(s.periodStart); }
export function renumber(db) { ['a', 'b', 'joint'].forEach(tm => { db.trainings.filter(t => t.teamId === tm && t.status !== 'cancelled').sort((x, y) => x.date.localeCompare(y.date) || x.start.localeCompare(y.start)).forEach((t, i) => { t.seq = i + 1; }); }); }
export function makeTraining(db, o, today) {
  const start = isValidTime(o.start || '') ? o.start : '07:00', end = isValidTime(o.end || '') ? o.end : '17:00'; const topicId = o.topicId || (db.topics[0] || {}).id; const teamId = o.teamId || 'a'; const location = o.location || '';
  const t = { id: uid('t'), seq: 0, teamId, topicId, date: o.date, endDate: o.endDate || null, start, end, location, coords: o.coords || '', instructorId: o.instructorId || null, commanderId: o.commanderId || null, instStatus: o.instStatus || 'pending', cmdStatus: o.cmdStatus || 'pending', status: o.status || 'planned', instInvitedAt: o.instructorId ? nowStamp(today || DEFAULT_TODAY) : null, cmdInvitedAt: o.commanderId ? nowStamp(today || DEFAULT_TODAY) : null, feedback: {}, freq: o.freq || 'רשת חפ״ק: ערוץ 3 · חלופי: ערוץ 7', safety: o.safety || topicSafety(topicId), pickup: o.pickup || 'שער בסיס האם', departure: addMinutes(start, -90), medicId: null, orderFile: null, notes: o.notes || '', dayBlocks: defaultDayBlocks(start, end, topicId), ...defaultLogistics(topicId, teamId, start, db.people, location), attendance: {}, trainerSummarized: false, approvedAll: false, approvalLog: [], ammoSigned: false, chat: [], summary: { commander: '', instructor: '', keep: '', improve: '', photos: [] }, cancelReason: '', createdAt: today || DEFAULT_TODAY, updatedAt: today || DEFAULT_TODAY };
  t.evacVehicleId = t.vehicles[0] ? t.vehicles[0].id : null; const medic = participants(db, t).find(p => p.role === 'חובש'); t.medicId = medic ? medic.id : null; return t;
}
export function qualifiedInstructor(db, topicId) { const c = db.people.filter(p => p.status === 'active' && p.isInstructor && p.qual.includes(topicId)); return c.length ? c[0].id : null; }
export function generateRotation(db, cfg, today) {
  const base = sundayOf(cfg.start); const wd = Number(cfg.weekday) || 0; const out = []; const topics = cfg.topics.length ? cfg.topics : db.topics.map(t => t.id); const jt = cfg.jointTopics.length ? cfg.jointTopics : topics;
  const mk = (teamId, week, topicId) => { const date = addDays(base, (week - 1) * 7 + wd); const cmd = teamId === 'joint' ? (db.teams.a.commanderId || db.teams.b.commanderId) : db.teams[teamId].commanderId; out.push(makeTraining(db, { teamId, topicId, date, start: cfg.startTime, end: cfg.endTime, location: cfg.location, commanderId: cmd, cmdStatus: 'pending', instructorId: qualifiedInstructor(db, topicId), status: 'planned' }, today)); };
  const tw = Number(cfg.teamWeeks) || 0, jw = Number(cfg.jointWeeks) || 0; const lag = cfg.stagger ? 1 : 0;
  for (let w = 1; w <= tw; w++) { mk('a', w, topics[(w - 1) % topics.length]); mk('b', w + lag, topics[(w - 1) % topics.length]); }
  for (let j = 1; j <= jw; j++) mk('joint', tw + lag + j, jt[(j - 1) % jt.length]);
  return out;
}
export function resetDB() { const db = buildSeed(); saveDB(db); return db; }
export function loadSession() { try { return localStorage.getItem(SESSION_KEY) || null; } catch (e) { return null; } }
export function saveSession(pid) { try { pid ? localStorage.setItem(SESSION_KEY, pid) : localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }
export function broadcast(source) { try { window.dispatchEvent(new CustomEvent('hapak:changed', { detail: { source } })); } catch (e) { /* ignore */ } }

// ── שאילתות ──────────────────────────────────────────────────────────────────
export const byId = (list, id) => list.find(x => x.id === id) || null;
export const personById = (db, id) => byId(db.people, id);
export const topicById = (db, id) => byId(db.topics, id);
export const topicName = (db, id) => (topicById(db, id) || {}).name || 'נושא חדש';
export function teamName(db, teamId) { return teamId === 'joint' ? 'משותף' : (db.teams[teamId] || {}).name || '—'; }
export function trainingCode(db, t) { return t.teamId === 'joint' ? `משותף ${pad(t.seq)}` : `אימון ${pad(t.seq)}`; }
export function trainingTitle(db, t) { return `${trainingCode(db, t)} · ${teamName(db, t.teamId)}`; }
export function participants(db, t) { return db.people.filter(p => p.status === 'active' && p.teamId && (t.teamId === 'joint' || p.teamId === t.teamId)).sort(rankSort); }
export function teamMembers(db, teamId) { return db.people.filter(p => p.teamId === teamId).sort(rankSort); }
export function activeTrainings(db) { return db.trainings.filter(t => t.status !== 'cancelled' && t.status !== 'done').sort((a, b) => a.date.localeCompare(b.date)); }
export function upcomingFor(db, user, today) {
  return activeTrainings(db).filter(t => t.date >= today && (!user.teamId ? true : t.teamId === 'joint' || t.teamId === user.teamId || t.instructorId === user.id || t.commanderId === user.id));
}
export function attendanceStats(db, t) {
  const ps = participants(db, t); const s = { total: ps.length, coming: 0, late: 0, absent: 0, responded: 0, unresponded: 0, approved: 0 };
  ps.forEach(p => { const a = t.attendance[p.id]; if (!a) { s.unresponded++; return; } s.responded++; if (a.status === 'coming') s.coming++; else if (a.status === 'late') s.late++; else s.absent++; if (a.approved) s.approved++; });
  s.expected = s.coming + s.late; s.pct = s.total ? Math.round(100 * s.responded / s.total) : 0;
  return s;
}
export function taughtCount(db, pid, before) { return db.trainings.filter(t => t.instructorId === pid && t.status !== 'cancelled' && (!before || t.date < before)).length; }
export function suggestSubstitute(db, t, role) {
  const currentId = role === 'instructor' ? t.instructorId : t.commanderId;
  const cands = db.people.filter(p => p.status === 'active' && p.id !== currentId && (role === 'instructor' ? p.isInstructor : (p.isTeamCommander || p.role === 'קמב״צ' || p.isHapakCommander)));
  const scored = cands.map(p => {
    let score = 0; const why = [];
    if (role === 'instructor' && p.qual.includes(t.topicId)) { score += 4; why.push('מוסמך לנושא'); }
    if (!db.trainings.some(x => x.id !== t.id && x.date === t.date && x.status !== 'cancelled' && (x.instructorId === p.id || x.commanderId === p.id))) { score += 2; why.push('זמין באותו יום'); }
    if (t.teamId !== 'joint' && p.teamId && p.teamId !== t.teamId) { score += 1; why.push('מהצוות השני'); }
    if (db.trainings.some(x => x.id !== t.id && x.topicId === t.topicId && x.instructorId === p.id && x.date < t.date)) { score += 2; why.push('העביר את הנושא בעבר'); }
    const n = taughtCount(db, p.id); score -= n * 0.3; if (n === 0) why.push('טרם העביר אימון בתקופה');
    return { p, score, why };
  }).sort((a, b) => b.score - a.score);
  return scored[0] || null;
}
export function trainingAlerts(db, t) {
  if (t.status === 'cancelled' || t.status === 'done') return [];
  const s = attendanceStats(db, t); const out = [];
  const min = t.teamId === 'joint' ? db.settings.minAttendance * 2 : db.settings.minAttendance;
  if (s.responded > 0 && s.expected < min) out.push(`צפויים ${s.expected} לוחמים — מתחת לסף המינימום (${min})`);
  if (s.unresponded > 0) out.push(`${s.unresponded} טרם סימנו נוכחות`);
  const ps = participants(db, t);
  db.settings.essentialRoles.forEach(role => {
    const has = ps.some(p => p.role === role && t.attendance[p.id] && ['coming', 'late'].includes(t.attendance[p.id].status));
    if (!has && s.responded > 0) out.push(role === 'חובש' ? 'אין חובש שסימן ״מגיע״' : `אין ${role} שסימן ״מגיע״`);
  });
  const drivers = ps.filter(p => p.role === 'נהג' && t.attendance[p.id] && ['coming', 'late'].includes(t.attendance[p.id].status)).length;
  if (s.responded > 0 && drivers < t.vehicles.length) out.push(`${drivers} נהגים מגיעים ל-${t.vehicles.length} רכבים`);
  if (t.instStatus !== 'accepted') out.push(t.instStatus === 'declined' ? 'המדריך דחה את ההזמנה — נדרש מחליף' : 'הזמנת המדריך טרם אושרה');
  if (t.cmdStatus !== 'accepted') out.push(t.cmdStatus === 'declined' ? 'מפקד האימון דחה את ההזמנה — נדרש מחליף' : 'הזמנת מפקד האימון טרם אושרה');
  if (t.vehicles.some(v => v.fitness !== 'כשיר')) out.push('רכב אחד או יותר אינו כשיר');
  if (inviteOverdue(db, t, 'instructor')) out.push(`הזמנת המדריך ללא מענה מעל ${db.settings.inviteHours || 48} שעות — מומלץ להזמין מחליף`);
  if (inviteOverdue(db, t, 'commander')) out.push(`הזמנת מפקד האימון ללא מענה מעל ${db.settings.inviteHours || 48} שעות`);
  const certTopic = ['fire', 'drive', 'medic', 'comms'].includes(t.topicId) ? t.topicId : null;
  if (certTopic) ps.forEach(p => { if (certStatus(p, certTopic, _today, db.settings.certAlertDays || 30) === 'expired') out.push(`${fullName(p)} — הסמכת ${CERT_TYPES.find(c => c[0] === certTopic)[1]} פקעה (אזהרה בלבד)`); });
  if (isPendingSummary(t, _today)) out.push('האימון עבר — ממתין לסיכום ולאישור נוכחות סופי');
  return out;
}
export function readinessOf(db, filterFn, today) {
  const members = db.people.filter(p => p.status === 'active' && p.teamId && filterFn(p));
  if (!members.length) return { score: 0, parts: [], note: 'אין לוחמים' };
  const ratingAvg = members.reduce((s, p) => s + (p.rating || 0), 0) / members.length;
  const done = db.trainings.filter(t => t.status === 'done' && members.some(p => t.teamId === 'joint' || t.teamId === p.teamId));
  const parts = [{ label: 'דירוג מפקד', w: 0.5, v: ratingAvg }];
  if (done.length) {
    let slots = 0, present = 0; const topics = new Set();
    done.forEach(t => { const ps = participants(db, t).filter(p => members.includes(p)); slots += ps.length; ps.forEach(p => { const a = t.attendance[p.id]; if (a && a.approved && a.status === 'coming') present++; }); topics.add(t.topicId); });
    parts.push({ label: 'נוכחות מאושרת', w: 0.25, v: slots ? 10 * present / slots : 0 });
    parts.push({ label: 'נושאים שהושלמו', w: 0.25, v: 10 * topics.size / db.topics.length });
  }
  const wsum = parts.reduce((s, p) => s + p.w, 0);
  const score = Math.round(10 * parts.reduce((s, p) => s + p.w * p.v, 0) / wsum) / 10;
  return { score, parts, note: done.length ? `${done.length} אימונים הסתיימו` : 'כשירות התחלתית — לפי דירוג מפקד בלבד' };
}
export function permsFor(db, user, t) {
  const isAdmin = !!(user && (user.isAdmin || user.isHapakCommander));
  const isTeamCmd = !!(user && user.isTeamCommander && (!t || t.teamId === user.teamId || t.teamId === 'joint'));
  const isTrainCmd = !!(t && user && t.commanderId === user.id);
  const isInstr = !!(t && user && t.instructorId === user.id);
  return {
    isAdmin, isTeamCmd, isTrainCmd, isInstr,
    canEdit: isAdmin || isTeamCmd || isTrainCmd || isInstr,
    canCreate: isAdmin || !!(user && user.isTeamCommander),
    canInvite: isAdmin || isTeamCmd || isTrainCmd,
    canSummarize: isAdmin || isTrainCmd,
    canApprove: !!t && (isAdmin || (t.teamId === 'joint' ? isTrainCmd : isTeamCmd)),
    canManagePeople: isAdmin, canManagePeriod: isAdmin, canGrantRoles: isAdmin, canDeleteTraining: isAdmin, canEditCerts: isAdmin, canCalendar: isAdmin, seesFeedback: isAdmin || isTeamCmd || isTrainCmd || isInstr,
    canExport: isAdmin || !!(user && user.isTeamCommander) || isTrainCmd,
    seesStats: isAdmin || !!(user && user.isTeamCommander) || isTrainCmd || isInstr,
    seesPN: isAdmin || !!(user && user.isTeamCommander) || isTrainCmd,
    seesList: isAdmin || !!(user && user.isTeamCommander) || isTrainCmd || isInstr,
    canPin: isAdmin || isTeamCmd || isTrainCmd,
    canSignAmmo: isAdmin || isTrainCmd,
  };
}
export function roleLabel(db, p) {
  if (!p) return '';
  if (p.isAdmin && p.isHapakCommander) return 'מפקד החפ״ק · מנהל מערכת'; if (p.isAdmin) return 'מנהל מערכת'; if (p.isHapakCommander) return 'מפקד החפ״ק';
  if (p.isTeamCommander) return `מפקד ${teamName(db, p.teamId)}`;
  return `${p.role} · ${teamName(db, p.teamId)}`;
}
export function calendarEvents(week) { return calendarEventsFor(_db, week); }
const HOLIDAYS = { '2026-09-12': 'ראש השנה', '2026-09-13': 'ראש השנה', '2026-09-21': 'יום כיפור', '2026-09-26': 'סוכות', '2026-10-03': 'שמחת תורה', '2026-12-05': 'חנוכה · נר ראשון' };
export function calendarEventsFor(db, week) {
  const start = weekStart(week), end = addDays(start, 6); const out = [];
  for (let i = 0; i < 7; i++) { const d = addDays(start, i); if (HOLIDAYS[d]) out.push({ id: 'hol:' + d, date: d, time: 'כל היום', title: HOLIDAYS[d], special: true, holiday: true }); }
  ((db && db.calendar) || []).filter(e => e.date >= start && e.date <= end).forEach(e => out.push({ ...e, time: e.allDay ? 'כל היום' : (e.time || ''), special: false, holiday: false }));
  const key = e => e.time === 'כל היום' ? '' : e.time;
  return out.sort((a, b) => a.date.localeCompare(b.date) || key(a).localeCompare(key(b)));
}
export function certStatus(p, type, today, alertDays) { const exp = p.certs && p.certs[type]; if (!exp) return 'none'; const d = daysBetween(today, exp); return d < 0 ? 'expired' : d <= (alertDays || 30) ? 'soon' : 'ok'; }
export function certAlerts(db, today) { const out = []; db.people.filter(p => p.status === 'active').forEach(p => CERT_TYPES.forEach(([k, label]) => { const s = certStatus(p, k, today, db.settings.certAlertDays); if (s === 'soon' || s === 'expired') out.push({ p, type: k, label, expires: p.certs[k], status: s, text: `${fullName(p)} — ${label} ${s === 'expired' ? 'פקעה' : 'פוקעת'} ב-${fmtFull(p.certs[k])}` }); })); return out; }
export function isPendingSummary(t, today) { return t.date < (today || _today) && t.status !== 'done' && t.status !== 'cancelled'; }
export function summaryLocked(db, t, user, today) { if (user && (user.isAdmin || user.isHapakCommander)) return false; return t.status === 'done' && daysBetween(t.date, today) > (db.settings.summaryLockDays || 7); }
export function stampToMs(s) { if (!s) return NaN; const [d, tm] = s.split(' '); return new Date(`${d}T${tm || '00:00'}:00`).getTime(); }
export function inviteOverdue(db, t, role) { const st = role === 'instructor' ? t.instStatus : t.cmdStatus; const at = role === 'instructor' ? t.instInvitedAt : t.cmdInvitedAt; if (st !== 'pending' || !at) return false; return stampToMs(`${_today} ${_now}`) - stampToMs(at) > (db.settings.inviteHours || 48) * 3600000; }
export function bannerTrainings(db, user, today) { const tomorrow = addDays(today, 1); return activeTrainings(db).filter(t => (t.date === today || t.date === tomorrow) && (!user.teamId || t.teamId === 'joint' || t.teamId === user.teamId || t.instructorId === user.id || t.commanderId === user.id)); }
function leadersOf(db, t) { return [...new Set([t.commanderId, ...(t.teamId !== 'joint' && db.teams[t.teamId] ? [db.teams[t.teamId].commanderId] : []), ...db.people.filter(p => p.isAdmin || p.isHapakCommander).map(p => p.id)])].filter(Boolean); }
export function runAutomations(db, today, now) {
  setToday(today, now); db.__today = today; db.remindersSent = db.remindersSent || {}; const sent = db.remindersSent; const s = db.settings; let changed = false; const mark = k => { sent[k] = `${today} ${now}`; changed = true; }; const tomorrow = addDays(today, 1);
  activeTrainings(db).forEach(t => {
    const ids = [...new Set([...participants(db, t).map(p => p.id), t.instructorId, t.commanderId])].filter(Boolean);
    if (t.date === tomorrow && now >= (s.eveningReminder || '18:00') && !sent[t.id + ':eve']) { notify(db, `תזכורת: מחר ${topicName(db, t.topicId)} (${trainingTitle(db, t)}) · יציאה ${t.departure} מ${t.pickup} · ${t.location}`, ids, t.id); mark(t.id + ':eve'); }
    if (t.date === today && now >= addMinutes(t.departure, -(s.morningReminderBefore || 120)) && now < t.departure && !sent[t.id + ':morn']) { notify(db, `היום: ${topicName(db, t.topicId)} · יציאה ${t.departure} מ${t.pickup}`, ids, t.id); mark(t.id + ':morn'); }
    if (isPendingSummary(t, today) && !sent[t.id + ':sum']) { notify(db, `${trainingTitle(db, t)} (${topicName(db, t.topicId)}, ${fmtShort(t.date)}) הסתיים — ממתין לסיכום מפקד האימון ולאישור נוכחות סופי.`, leadersOf(db, t), t.id); mark(t.id + ':sum'); }
    ['instructor', 'commander'].forEach(role => { const k = `${t.id}:${role}:over:${role === 'instructor' ? t.instructorId : t.commanderId}`; if (inviteOverdue(db, t, role) && !sent[k]) { notify(db, `הזמנת ${role === 'instructor' ? 'המדריך' : 'מפקד האימון'} ל${trainingTitle(db, t)} ללא מענה מעל ${s.inviteHours || 48} שעות — מומלץ להזמין מחליף.`, leadersOf(db, t), t.id); mark(k); } });
  });
  certAlerts(db, today).forEach(a => { const k = `cert:${a.p.id}:${a.type}:${a.expires}`; if (!sent[k]) { notify(db, `הסמכה: ${a.text}`, [...new Set([a.p.id, ...db.people.filter(p => p.isAdmin || p.isHapakCommander).map(p => p.id)])], null); mark(k); } });
  return changed;
}
export function orderHTML(db, t) { const esc = s => String(s ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])); const rows = arr => arr.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
  return `<h1>פקודת אימון · ${esc(trainingTitle(db, t))} · ${esc(topicName(db, t.topicId))}</h1><h2>${esc(dateLine(t))} · ${esc(t.location)} · נצ״ד ${esc(t.coords)}</h2>`
    + `<table><tbody>${rows([['מדריך', fullName(personById(db, t.instructorId))], ['מפקד אימון', fullName(personById(db, t.commanderId))], ['יציאה', `${t.departure} מ${t.pickup}`], ['קשר', t.freq], ['חובש תורן', fullName(personById(db, t.medicId))], ['הוראות בטיחות', t.safety], ['הערות', t.notes || '—']])}</tbody></table>`
    + `<h2 style="margin-top:16px">לו״ז יום האימון</h2><table><tbody>${rows(t.dayBlocks.map(b => [b.time, b.title]))}</tbody></table>`
    + `<h2 style="margin-top:16px">לוגיסטיקה</h2><table><thead><tr><th>ציוד</th><th>כמות</th></tr></thead><tbody>${rows(t.gear.map(g => [g.name, g.qty]))}</tbody></table>`
    + `<table style="margin-top:8px"><thead><tr><th>רכב</th><th>צ׳</th><th>נהג</th><th>יציאה</th><th>מקומות</th></tr></thead><tbody>${rows(t.vehicles.map(v => [v.type, v.tz, fullName(personById(db, v.driverId)), v.departure, v.seats]))}</tbody></table>`
    + `<table style="margin-top:8px"><thead><tr><th>נשק</th><th>כדורים ללוחם</th><th>הקצאה</th></tr></thead><tbody>${rows(t.ammo.map(a => [a.weapon, a.perFighter || '—', a.allocated]))}</tbody></table>`
    + `<table style="margin-top:8px"><thead><tr><th>מזון ושתייה</th><th>כמות</th><th>הערה</th></tr></thead><tbody>${rows(t.food.map(f => [f.name, `${f.qty} ${f.unit}`, f.note]))}</tbody></table>`; }
function calendarEventsLegacy(week) {
  const start = weekStart(week); const out = [];
  const specials = {
    '2026-09-12': ['כל היום', 'ראש השנה'], '2026-09-13': ['כל היום', 'ראש השנה'], '2026-09-21': ['כל היום', 'יום כיפור · אין פעילות'],
    '2026-09-26': ['כל היום', 'סוכות'], '2026-10-03': ['כל היום', 'שמחת תורה'], '2026-09-23': ['10:00', 'ביקור מח״ט באימון חפ״ק (צוות א׳) · שטח ״רמה״'],
    '2026-10-14': ['11:30', 'המח״ט במטווח — אימון ירי צוות א׳'], '2026-11-05': ['09:00', 'ועדת תכנון אימונים 2027'], '2026-11-18': ['20:00', 'המח״ט בניוד לילה משותף'],
    '2026-12-01': ['08:00', 'המח״ט בתרגיל המפקדות המסכם (יומיים)'], '2026-12-02': ['12:00', 'סיכום תרגיל מפקדות עם המח״ט'],
  };
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i); const dow = parseISO(d).getUTCDay();
    if (specials[d]) out.push({ date: d, time: specials[d][0], title: specials[d][1], special: true });
    if (dow === 0) out.push({ date: d, time: '08:30', title: 'הערכת מצב שבועית · מפקדת החטיבה' });
    if (dow === 2) out.push({ date: d, time: '13:00', title: 'סיור גזרה' });
    if (dow === 4) out.push({ date: d, time: '09:00', title: 'פורום מפקדים' });
    if (dow === 4 && i > 0) out.push({ date: d, time: '16:00', title: 'סיכום שבוע · מח״ט' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}
export function orderText(db, t) {
  const i = personById(db, t.instructorId), c = personById(db, t.commanderId);
  const lines = [`פקודת אימון — ${db.settings.unitName}`, `${trainingTitle(db, t)} · ${topicName(db, t.topicId)}`, dateLine(t), `מיקום: ${t.location} · נצ״ד ${t.coords}`,
    `מדריך: ${fullName(i)} · מפקד אימון: ${fullName(c)}`, `יציאה: ${t.departure} מ${t.pickup}`, `קשר: ${t.freq}`, `בטיחות: ${t.safety}`, '',
    'לו״ז יום:', ...t.dayBlocks.map(b => `  ${b.time} ${b.title}`), '',
    'לוגיסטיקה:', ...t.gear.map(g => `  ${g.name} ×${g.qty}`), ...t.vehicles.map(v => `  ${v.type} צ׳ ${v.tz} · נהג ${fullName(personById(db, v.driverId))} · יציאה ${v.departure}`),
    ...t.ammo.map(a => `  ${a.weapon}: ${a.allocated} כד׳${a.perFighter ? ` (${a.perFighter} ללוחם)` : ''}`), ...t.food.map(f => `  ${f.name} ${f.qty} ${f.unit}`)];
  return lines.join('\n');
}
export function attendanceCSV(db, t) {
  const rows = [['שם ודרגה', 'מספר אישי', 'צוות', 'תפקיד', 'סטטוס נוכחות', 'סיבה', 'שעת סימון', 'מאשר']];
  participants(db, t).forEach(p => { const a = t.attendance[p.id]; rows.push([fullName(p), p.pn, teamName(db, p.teamId), p.role, a ? STATUS_LABEL[a.status] : 'לא הגיב (נחשב לא מגיע)', a ? a.reason : '', a ? a.time : '', a && a.approved ? fullName(personById(db, a.approvedBy)) : '']); });
  return '\uFEFF' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
}
export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function printHTML(title, bodyHTML) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;color:#555;margin:0 0 16px;font-weight:400}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}th{background:#f2f2f2}.muted{color:#666;font-size:12px;margin-top:18px}</style></head><body>${bodyHTML}<p class="muted">הופק מ-${title} · ${new Date().toLocaleString('he-IL')}</p></body></html>`);
  w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* ignore */ } }, 300);
  return true;
}
export function nowStamp(today) { const d = new Date(); return `${today} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function notify(db, text, to, tid) { db.notifications.unshift({ id: uid('n'), text, time: nowStamp(db.__today || DEFAULT_TODAY), read: false, to, tid: tid || null }); if (db.notifications.length > 60) db.notifications.length = 60; }
export function notifsFor(db, user) { return db.notifications.filter(n => !n.to || (user && n.to.includes(user.id))); }
export function reminderPreview(db, t, user) {
  const out = [];
  const prefs = (user && user.notif) || {};
  if (prefs.evening !== false) out.push(`${fmtShort(addDays(t.date, -1))} ${db.settings.eveningReminder} · תזכורת ערב לפני: ${topicName(db, t.topicId)}, יציאה ${t.departure}`);
  if (prefs.morning !== false) out.push(`${fmtShort(t.date)} ${addMinutes(t.departure, -db.settings.morningReminderBefore)} · תזכורת בוקר: שעתיים ליציאה מ${t.pickup}`);
  return out;
}
