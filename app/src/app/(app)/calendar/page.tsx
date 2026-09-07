'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { calendarEventsFor } from '@/lib/core/calendar';
import { DAY_LETTERS } from '@/lib/core/constants';
import { addDays, pad, parseISO, weekOf, weekRange, weekStart } from '@/lib/core/dates';
import { permsFor } from '@/lib/core/permissions';
import { activeTrainings, topicName, trainingTitle } from '@/lib/core/selectors';
import type { CalendarEvent } from '@/lib/core/types';
import { deleteCalendarEvent, saveCalendarEvent } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

/** The brigade commander's week: trainings alongside manually entered events. */
export default function CalendarPage() {
  const { db, user, today, toast, refresh } = useApp();
  const router = useRouter();
  const [week, setWeek] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; date: string } | null>(null);

  if (!db || !user) return null;

  const perms = permsFor(db, user, null);
  const w = week ?? weekOf(db.settings.period_start, today);
  const start = weekStart(db.settings.period_start, w);
  const events = calendarEventsFor(db, w);
  const live = db.trainings.filter((t) => t.status !== 'cancelled');

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 26, margin: '0 0 4px' }}>יומן המח״ט</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-500)' }}>
              {db.settings.brigade_commander ? `יומן ${db.settings.brigade_commander} · ` : ''}
              הזנה ידנית על ידי מנהל המערכת / מפקד החפ״ק · סנכרון Google Calendar בשלב הבא
            </p>
          </div>
          {perms.canCalendar && (
            <button
              className="btn btn-primary"
              onClick={() => setEditing({ id: null, date: start })}
              style={{ whiteSpace: 'nowrap' }}
            >
              + אירוע ביומן
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="btn btn-secondary btn-icon"
            aria-label="שבוע קודם"
            onClick={() => setWeek(w - 1)}
            style={{ width: 32, height: 32 }}
          >
            ›
          </button>
          <span className="tabnum" style={{ fontSize: 15, minWidth: 200, textAlign: 'center' }}>
            שבוע {pad(w)} · {weekRange(db.settings.period_start, w)}
          </span>
          <button
            className="btn btn-secondary btn-icon"
            aria-label="שבוע הבא"
            onClick={() => setWeek(w + 1)}
            style={{ width: 32, height: 32 }}
          >
            ‹
          </button>
          <button className="btn btn-ghost" onClick={() => setWeek(weekOf(db.settings.period_start, today))}>
            היום
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(140px,1fr))',
            gap: 1,
            background: 'var(--color-neutral-900)',
            border: '1px solid var(--color-neutral-900)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            minWidth: 900,
          }}
        >
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDays(start, i);
            const isToday = d === today;
            return (
              <div
                key={d}
                style={{
                  background: 'var(--color-bg)',
                  minHeight: 260,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>{DAY_LETTERS[i]}</span>
                  <span
                    className="tabnum"
                    style={{ fontSize: 16, color: isToday ? 'var(--color-accent)' : 'var(--color-text)' }}
                  >
                    {parseISO(d).getUTCDate()}
                  </span>
                  {isToday && <span style={{ fontSize: 10.5, color: 'var(--color-accent)' }}>היום</span>}
                </div>

                {live
                  .filter((t) => t.date === d || t.end_date === d)
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => router.push(`/trainings/${t.id}`)}
                      style={{
                        textAlign: 'start',
                        padding: '7px 9px',
                        borderRadius: 'var(--radius-sm)',
                        border: 0,
                        cursor: 'pointer',
                        color: 'inherit',
                        fontFamily: 'inherit',
                        fontSize: 12,
                        lineHeight: 1.35,
                        boxShadow: '0 0 0 1px var(--color-accent-700)',
                        background: t.team_id === 'joint' ? 'var(--color-accent-900)' : 'var(--color-surface)',
                      }}
                    >
                      {trainingTitle(db, t)} · {topicName(db, t.topic_id)}
                      <span
                        className="tabnum"
                        style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-400)' }}
                      >
                        {t.start}–{t.end} · {t.location}
                      </span>
                    </button>
                  ))}

                {events
                  .filter((e) => e.date === d)
                  .map((e) => {
                    const linked = e.training_id ? db.trainings.find((t) => t.id === e.training_id) : null;
                    const sub = [e.location, linked ? `קשור ל${trainingTitle(db, linked)}` : '', e.note]
                      .filter(Boolean)
                      .join(' · ');
                    const editable = perms.canCalendar && !e.holiday;
                    return (
                      <button
                        key={e.id}
                        onClick={() => editable && setEditing({ id: e.id, date: d })}
                        disabled={!editable}
                        style={{
                          textAlign: 'start',
                          padding: '6px 8px',
                          borderRadius: 'var(--radius-sm)',
                          border: 0,
                          color: 'inherit',
                          fontFamily: 'inherit',
                          cursor: editable ? 'pointer' : 'default',
                          fontSize: 12,
                          lineHeight: 1.35,
                          background: e.holiday ? 'var(--color-accent-900)' : 'var(--color-neutral-900)',
                        }}
                      >
                        <span className="tabnum" style={{ color: 'var(--color-neutral-400)' }}>
                          {e.time}
                        </span>{' '}
                        {e.title}
                        {sub && (
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-500)' }}>
                            {sub}
                          </span>
                        )}
                      </button>
                    );
                  })}

                {perms.canCalendar && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => setEditing({ id: null, date: d })}
                    style={{ fontSize: 11.5, padding: '2px 6px', alignSelf: 'flex-start', marginTop: 'auto' }}
                  >
                    + אירוע
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <CalendarEventDialog
          eventId={editing.id}
          date={editing.date}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            await refresh();
            toast(msg);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function CalendarEventDialog({
  eventId,
  date,
  onClose,
  onSaved,
}: {
  eventId: string | null;
  date: string;
  onClose: () => void;
  onSaved: (msg: string) => Promise<void>;
}) {
  const { db, toast } = useApp();
  const existing = eventId && db ? db.calendar.find((e) => e.id === eventId) : null;
  const [f, setF] = useState<Omit<CalendarEvent, 'id' | 'source'>>({
    title: existing?.title ?? '',
    date: existing?.date ?? date,
    time: existing?.time ?? '',
    all_day: existing?.all_day ?? false,
    location: existing?.location ?? '',
    training_id: existing?.training_id ?? null,
    note: existing?.note ?? '',
  });

  if (!db) return null;

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({
      ...s,
      [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value,
    }));

  return (
    <Dialog
      open
      onClose={onClose}
      title={existing ? 'עריכת אירוע ביומן המח״ט' : 'אירוע חדש ביומן המח״ט'}
      width={600}
      actions={
        <>
          {existing && (
            <button
              className="btn btn-ghost"
              onClick={async () => {
                try {
                  await deleteCalendarEvent(existing.id);
                  await onSaved('האירוע נמחק');
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'המחיקה נכשלה');
                }
              }}
            >
              מחיקה
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              try {
                await saveCalendarEvent(existing?.id ?? null, f);
                await onSaved('האירוע נשמר ביומן המח״ט');
              } catch (e) {
                toast(e instanceof Error ? e.message : 'השמירה נכשלה');
              }
            }}
          >
            שמירה
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="כותרת" style={{ gridColumn: 'span 2' }}>
          <input
            className="input"
            value={f.title}
            onChange={set('title')}
            placeholder="לדוגמה: ביקור מח״ט באימון"
          />
        </Field>
        <Field label="תאריך">
          <input className="input" type="date" value={f.date} onChange={set('date')} />
        </Field>
        <Field label="שעה">
          <input className="input" type="time" value={f.time} onChange={set('time')} disabled={f.all_day} />
        </Field>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            cursor: 'pointer',
            gridColumn: 'span 2',
          }}
        >
          <input type="checkbox" checked={f.all_day} onChange={set('all_day')} />
          כל היום
        </label>
        <Field label="מיקום">
          <input className="input" value={f.location} onChange={set('location')} />
        </Field>
        <Field label="קשור לאימון">
          <select
            className="input"
            value={f.training_id ?? ''}
            onChange={(e) => setF((s) => ({ ...s, training_id: e.target.value || null }))}
          >
            <option value="">ללא קישור לאימון</option>
            {activeTrainings(db).map((t) => (
              <option key={t.id} value={t.id}>
                {trainingTitle(db, t)} · {topicName(db, t.topic_id)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="הערה" style={{ gridColumn: 'span 2' }}>
          <input className="input" value={f.note} onChange={set('note')} />
        </Field>
      </div>
    </Dialog>
  );
}
