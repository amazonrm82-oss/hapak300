import { DAY_LETTERS } from './constants';
import type { Training } from './types';

/**
 * Dates are handled as plain ISO `YYYY-MM-DD` strings in UTC so a training on
 * 23.9 stays on 23.9 in every timezone. Times are `HH:MM` on a 24-hour clock.
 */

export const pad = (n: number | string) => String(n).padStart(2, '0');

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function dayLetter(iso: string): string {
  return DAY_LETTERS[parseISO(iso).getUTCDay()];
}

export function fmtShort(iso: string): string {
  const d = parseISO(iso);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}

export function fmtFull(iso: string): string {
  const d = parseISO(iso);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** The Sunday that opens the ISO week containing `iso`. */
export function sundayOf(iso: string): string {
  return addDays(iso, -parseISO(iso).getUTCDay());
}

/** Week numbers run from the period's first Sunday; week 01 contains `period_start`. */
export function weekOf(periodStart: string, iso: string): number {
  return Math.floor(daysBetween(periodStart, iso) / 7) + 1;
}

export function weekStart(periodStart: string, n: number): string {
  return addDays(periodStart, (n - 1) * 7);
}

export function weekRange(periodStart: string, n: number): string {
  const s = weekStart(periodStart, n);
  return `${fmtShort(s)}–${fmtShort(addDays(s, 6))}`;
}

export function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

export function relDays(today: string, iso: string): string {
  const d = daysBetween(today, iso);
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d > 1) return `בעוד ${d} ימים`;
  if (d === -1) return 'אתמול';
  return `לפני ${-d} ימים`;
}

export function dateLine(t: Pick<Training, 'date' | 'end_date' | 'start' | 'end'>): string {
  const base = `יום ${dayLetter(t.date)} ${fmtFull(t.date)} · ${t.start}–${t.end}`;
  return t.end_date ? `${base} (${fmtShort(t.end_date)})` : base;
}

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime());
}

export function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Local date in Israel, as `YYYY-MM-DD`. */
export function realToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
}

/** Local time in Israel, as `HH:MM` on a 24-hour clock. */
export function realNow(): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function nowStamp(today: string, now: string): string {
  return `${today} ${now}`;
}

export function stampToMs(s: string | null): number {
  if (!s) return NaN;
  const [d, tm] = s.split(' ');
  return new Date(`${d}T${tm || '00:00'}:00`).getTime();
}

/**
 * Sunrise and sunset for a date, computed locally (NOAA's low-precision
 * algorithm). Default coordinates are central Israel; DST ends 25.10.2026.
 */
export function sunTimes(iso: string, lat = 32.08, lon = 34.78): { rise: string; set: string } {
  const d = parseISO(iso);
  const y = d.getUTCFullYear();
  const doy = Math.floor((d.getTime() - Date.UTC(y, 0, 0)) / 86400000);
  const tz = iso < '2026-10-25' ? 3 : 2;
  const rad = Math.PI / 180;
  const calc = (rising: boolean) => {
    const lngHour = lon / 15;
    const t = doy + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634;
    L = (L + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
    RA = (RA + 360) % 360;
    RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    let H = rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad;
    H /= 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const UT = (T - lngHour + 24) % 24;
    const local = (UT + tz + 24) % 24;
    return `${pad(Math.floor(local))}:${pad(Math.round((local % 1) * 60) % 60)}`;
  };
  return { rise: calc(true), set: calc(false) };
}
