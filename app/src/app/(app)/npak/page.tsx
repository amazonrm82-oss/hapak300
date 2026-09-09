'use client';

import { useState } from 'react';
import { useShareOrder } from '@/components/dialogs/TextDialog';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, Field, SectionCard } from '@/components/ui/bits';
import { canDrive } from '@/lib/core/alerts';
import { fmtFull } from '@/lib/core/dates';
import { npakText } from '@/lib/core/exports';
import { permsFor } from '@/lib/core/permissions';
import { fullName, personById, rankSort } from '@/lib/core/selectors';
import type { Npak, NpakRow, NpakSeat, Person } from '@/lib/core/types';
import { issueNpak } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

/** A row while it is being built: people are ids until it is issued. */
interface Draft {
  type: string;
  tz: string;
  seats: number;
  driver_id: string;
  people: string[];
  /** Written in by hand: somebody who is not in the system at all. */
  extra: NpakSeat[];
}

/**
 * נפ״ק — who rides in which vehicle.
 *
 * Its own screen, not part of any training: a convoy is put together for
 * whatever reason there is that day, and the answer is the same either way.
 * A vehicle, how many it seats — four means the driver and three — who drives,
 * and who sits in it. What comes out is the list read at the gate: today's
 * date, and per vehicle the type and registration, the driver by name and
 * personal number, and each fighter by name, personal number and post.
 *
 * It is sent on WhatsApp and kept afterwards exactly as it went out, so the
 * question asked a month later — who was in which vehicle, and when — has an
 * answer. The rows are stored whole rather than as references: a fighter who
 * changes team next week does not rewrite a manifest that already went out.
 *
 * The driver list is the same one the rest of the system uses: marked as a
 * driver on his card, with a licence in date today. Nobody is seated twice.
 */
export default function NpakPage() {
  const { db, user, today, toast, refresh } = useApp();
  const { toWhatsApp, dialog } = useShareOrder((m) => toast(m));
  const [rows, setRows] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  // the form for somebody who is not in the system: row index, and his details
  const [manual, setManual] = useState<{ row: number } & NpakSeat | null>(null);

  if (!db || !user) return null;

  const perms = permsFor(db, user, null);
  const canIssue = perms.isAdmin || perms.isTeamCmd;

  if (!canIssue)
    return (
      <EmptyState
        title="הנפ״ק שמור למפקדים"
        sub="הוא כולל מספרים אישיים של כל מי שנוסע, ולכן פתוח למפקדי הצוותים, מפקד החפ״ק ומנהל המערכת."
      />
    );

  const force = db.people.filter((p) => p.status === 'active').sort(rankSort);
  const drivers = force.filter((p) => (p.is_driver || p.role === 'נהג') && canDrive(p, today));

  /** Everyone already seated somewhere, so nobody is offered twice. */
  const taken = new Set<string>();
  rows.forEach((r) => {
    if (r.driver_id) taken.add(r.driver_id);
    r.people.forEach((id) => taken.add(id));
  });

  const patch = (i: number, part: Partial<Draft>) =>
    setRows((s) => s.map((r, j) => (j === i ? { ...r, ...part } : r)));

  const addRow = (v?: { type: string; tz: string; seats: number }) =>
    setRows((s) => [
      ...s,
      {
        type: v?.type ?? db.vehicle_types[0] ?? 'האמר',
        tz: v?.tz ?? '',
        seats: v?.seats ?? 6,
        driver_id: '',
        people: [],
        extra: [],
      },
    ]);

  const seat = (p: Person) => ({ name: fullName(p), pn: p.pn, role: p.role });

  const built = (): NpakRow[] =>
    rows.map((r) => ({
      type: r.type,
      tz: r.tz.trim(),
      seats: r.seats,
      driver: r.driver_id ? seat(personById(db, r.driver_id) as Person) : null,
      people: [
        ...r.people.map((id) => personById(db, id)).filter(Boolean).map((p) => seat(p as Person)),
        ...r.extra,
      ],
    }));

  const issue = async () => {
    setBusy(true);
    try {
      const saved = await issueNpak(db, user, null, built());
      await refresh();
      setRows([]);
      toWhatsApp(npakText(db, saved), 'הנפ״ק');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הוצאת הנפ״ק נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const onTheList = new Set(rows.map((r) => r.tz).filter(Boolean));
  const spare = db.fleet.filter((x) => x.active && !onTheList.has(x.tz));

  const addManual = () => {
    if (!manual) return;
    const name = manual.name.trim();
    if (!name) return toast('נדרש שם');
    patch(manual.row, {
      extra: [
        ...rows[manual.row].extra,
        { name, pn: manual.pn.trim(), role: manual.role.trim() },
      ],
    });
    setManual(null);
  };

  return (
    <>
      {dialog}

      {manual && (
        <Dialog
          open
          onClose={() => setManual(null)}
          title="הוספת מי שאינו במערכת"
          body="נהג מיחידה אחרת, אורח, מי שעדיין לא הוזן. הוא נרשם בנפ״ק כפי שתכתוב כאן."
          width={520}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setManual(null)}>
                ביטול
              </button>
              <button className="btn btn-primary" onClick={addManual}>
                הוסף לרכב
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="שם מלא" style={{ gridColumn: 'span 2' }}>
              <input
                className="input"
                value={manual.name}
                onChange={(e) => setManual({ ...manual, name: e.target.value })}
                placeholder="דרגה ושם"
              />
            </Field>
            <Field label="מספר אישי">
              <input
                className="input tabnum"
                inputMode="numeric"
                value={manual.pn}
                onChange={(e) => setManual({ ...manual, pn: e.target.value })}
              />
            </Field>
            <Field label="תפקיד">
              <input
                className="input"
                value={manual.role}
                onChange={(e) => setManual({ ...manual, role: e.target.value })}
                placeholder="למשל: נהג, מאבטח"
              />
            </Field>
          </div>
        </Dialog>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>נפ״ק</h1>
        <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>
          מי נוסע באיזה רכב · {fmtFull(today)}
        </span>
      </div>

      <SectionCard
        title="נפ״ק חדש"
        right={
          <button className="btn btn-secondary" style={{ fontSize: 12.5 }} onClick={() => addRow()}>
            + רכב
          </button>
        }
      >
        <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
          לכל רכב: כמה מקומות יש בו — ארבעה מקומות הם נהג ועוד שלושה — מי נוהג, ומי יושב בו.
          לוחם משובץ פעם אחת בלבד, ורק מי שמסומן נהג עם הסמכת נהיגה בתוקף מוצע כנהג.
        </span>

        {spare.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>מהצי:</span>
            {spare.map((x) => (
              <button
                key={x.id}
                className="btn btn-secondary"
                style={{ fontSize: 12, minHeight: 32, padding: '4px 10px' }}
                onClick={() => addRow({ type: x.type, tz: x.tz, seats: x.seats })}
              >
                + {x.type} · צ׳ {x.tz}
              </button>
            ))}
          </div>
        )}

        {rows.length === 0 && (
          <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>
            עוד לא נבחר רכב. הוסף רכב מהצי, או רכב חדש.
          </span>
        )}

        {rows.map((r, i) => {
          const room = Math.max(0, r.seats - 1 - r.people.length - r.extra.length);
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-neutral-900)',
              }}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  className="input"
                  style={{ width: 'auto', minWidth: 130 }}
                  aria-label="סוג רכב"
                  value={r.type}
                  onChange={(e) => patch(i, { type: e.target.value })}
                >
                  {[...new Set([r.type, ...db.vehicle_types])].filter(Boolean).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
                <input
                  className="input tabnum"
                  style={{ width: 110 }}
                  placeholder="צ׳ רכב"
                  aria-label="צ׳ רכב"
                  value={r.tz}
                  onChange={(e) => patch(i, { tz: e.target.value })}
                />
                <input
                  className="input tabnum"
                  style={{ width: 92 }}
                  type="number"
                  min={1}
                  aria-label="מקומות"
                  value={r.seats}
                  onChange={(e) => patch(i, { seats: Math.max(1, Number(e.target.value) || 1) })}
                />
                <select
                  className="input"
                  style={{ width: 'auto', minWidth: 180 }}
                  aria-label="נהג"
                  value={r.driver_id}
                  onChange={(e) => patch(i, { driver_id: e.target.value })}
                >
                  <option value="">נהג — חובה לשבץ</option>
                  {drivers
                    .filter((p) => !taken.has(p.id) || p.id === r.driver_id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {fullName(p)}
                      </option>
                    ))}
                </select>
                <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  {room > 0 ? `עוד ${room} מקומות` : 'הרכב מלא'}
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, marginInlineStart: 'auto' }}
                  onClick={() => setRows((s) => s.filter((_, j) => j !== i))}
                >
                  הסר רכב
                </button>
              </div>

              {r.extra.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {r.extra.map((x, k) => (
                    <span
                      key={k}
                      className="tag tag-outline"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      {x.name} · {x.pn || '—'}
                      {x.role ? ` · ${x.role}` : ''}
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 11, padding: '0 4px', minHeight: 0 }}
                        aria-label={`הסרת ${x.name}`}
                        onClick={() =>
                          patch(i, { extra: r.extra.filter((_, m) => m !== k) })
                        }
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {force.map((p) => {
                  const on = r.people.includes(p.id);
                  const blocked = !on && (taken.has(p.id) || room === 0);
                  return (
                    <button
                      key={p.id}
                      className={`btn ${on ? 'btn-primary' : 'btn-secondary'}`}
                      disabled={blocked}
                      style={{ fontSize: 11.5, padding: '3px 8px', opacity: blocked ? 0.4 : 1 }}
                      onClick={() =>
                        patch(i, {
                          people: on ? r.people.filter((x) => x !== p.id) : [...r.people, p.id],
                        })
                      }
                    >
                      {on ? '✓ ' : ''}
                      {fullName(p)}
                    </button>
                  );
                })}
                {/* Somebody who is not in the system at all — a driver from
                    another unit, a guest. He rides in the vehicle either way,
                    so he belongs on the list that is read at the gate. */}
                <button
                  className="btn btn-secondary"
                  disabled={room === 0}
                  style={{ fontSize: 11.5, padding: '3px 10px' }}
                  onClick={() => setManual({ row: i, name: '', pn: '', role: '' })}
                >
                  + מי שאינו במערכת
                </button>
              </div>
            </div>
          );
        })}

        {rows.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => void issue()}>
              נפק ושלח בוואטסאפ
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => toWhatsApp(npakText(db, preview(built(), today)), 'תצוגה מקדימה')}
            >
              תצוגה מקדימה
            </button>
            <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
              הנפ״ק יישמר בארכיון עם התאריך והשעה, כפי שיצא.
            </span>
          </div>
        )}
      </SectionCard>

      <SectionCard title={`ארכיון נפ״ק (${db.npak.length})`}>
        {db.npak.length === 0 ? (
          <EmptyState
            title="עוד לא הוצא נפ״ק"
            sub="מה שתוציא כאן יישמר עם התאריך והשעה, ואפשר יהיה לשלוח אותו שוב."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {db.npak.map((n) => (
              <div
                key={n.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-neutral-900)',
                }}
              >
                <span className="tabnum" style={{ fontSize: 13 }}>
                  {fmtFull(n.issued_at.slice(0, 10))} · {n.issued_at.slice(11, 16)}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>
                  {n.rows.length} רכבים ·{' '}
                  {n.rows.reduce((s, r) => s + (r.driver ? 1 : 0) + r.people.length, 0)} נוסעים · הוציא{' '}
                  {fullName(personById(db, n.issued_by))}
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, marginInlineStart: 'auto' }}
                  onClick={() => toWhatsApp(npakText(db, n), 'הנפ״ק')}
                >
                  שלח שוב
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

/** A manifest that has not been issued yet, shaped like one, for the preview. */
const preview = (rows: NpakRow[], today: string): Npak => ({
  id: 'preview',
  training_id: null,
  issued_at: `${today}T00:00:00.000Z`,
  issued_by: null,
  rows,
});
