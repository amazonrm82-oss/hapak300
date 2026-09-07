import { HOLIDAYS } from './constants';
import { addDays, addMinutes, fmtShort, weekStart } from './dates';
import type { Db, Person, TrainingFull } from './types';

export interface CalendarEntry {
  id: string;
  date: string;
  time: string;
  title: string;
  location: string;
  note: string;
  training_id: string | null;
  holiday: boolean;
  special: boolean;
}

/** Brigade-calendar entries for one week: fixed holidays plus manually entered events. */
export function calendarEventsFor(db: Db, week: number): CalendarEntry[] {
  const start = weekStart(db.settings.period_start, week);
  const end = addDays(start, 6);
  const out: CalendarEntry[] = [];

  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (HOLIDAYS[d])
      out.push({
        id: 'hol:' + d,
        date: d,
        time: 'כל היום',
        title: HOLIDAYS[d],
        location: '',
        note: '',
        training_id: null,
        holiday: true,
        special: true,
      });
  }

  (db.calendar || [])
    .filter((e) => e.date >= start && e.date <= end)
    .forEach((e) =>
      out.push({
        id: e.id,
        date: e.date,
        time: e.all_day ? 'כל היום' : e.time || '',
        title: e.title,
        location: e.location,
        note: e.note,
        training_id: e.training_id,
        holiday: false,
        special: false,
      }),
    );

  const key = (e: CalendarEntry) => (e.time === 'כל היום' ? '' : e.time);
  return out.sort((a, b) => a.date.localeCompare(b.date) || key(a).localeCompare(key(b)));
}

/**
 * What reminders this person will receive for a training, given their
 * notification preferences. Display only — the cron job is what actually sends.
 */
export function reminderPreview(db: Db, t: TrainingFull, user: Person): string[] {
  const out: string[] = [];
  const prefs = user.notif || {};
  if (prefs.evening !== false)
    out.push(
      `${fmtShort(addDays(t.date, -1))} ${db.settings.evening_reminder} · תזכורת ערב לפני: ${
        db.topics.find((x) => x.id === t.topic_id)?.name ?? ''
      }, יציאה ${t.departure}`,
    );
  if (prefs.morning !== false)
    out.push(
      `${fmtShort(t.date)} ${addMinutes(t.departure, -db.settings.morning_reminder_before)} · תזכורת בוקר: שעתיים ליציאה מ${t.pickup}`,
    );
  return out;
}

/**
 * Fallback weather estimate used when the Open-Meteo lookup is unavailable.
 * Always labelled as an estimate in the UI — it is not a forecast.
 */
export function weatherEstimate(iso: string): { hi: number; lo: number; text: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const base = ({ 8: [31, 21], 9: [28, 18], 10: [23, 14], 11: [19, 10] } as Record<number, number[]>)[m] || [22, 13];
  const conds = ['בהיר', 'מעונן חלקית', 'בהיר', 'רוחות מזרחיות', 'מעונן', 'בהיר'];
  return { hi: base[0] - (day % 3), lo: base[1] - (day % 2), text: conds[day % conds.length] };
}
