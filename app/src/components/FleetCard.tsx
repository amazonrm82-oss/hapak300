'use client';

import { useState } from 'react';
import { SectionCard } from '@/components/ui/bits';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { FITNESS_OPTIONS } from '@/lib/core/constants';
import { permsFor } from '@/lib/core/permissions';
import type { FleetVehicle } from '@/lib/core/types';
import { removeFleetVehicle, saveFleetVehicle, type FleetForm } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

const blank = (type: string): FleetForm => ({
  tz: '',
  type,
  seats: 6,
  fitness: 'כשיר',
  note: '',
  active: true,
});

/**
 * The unit's own vehicles, each entered once with its צ׳. Every training then
 * picks from this list instead of retyping a number that has to match the one
 * on the vehicle — a typo there is a vehicle nobody can account for.
 */
export function FleetCard() {
  const { db, user, toast, refresh } = useApp();
  const [f, setF] = useState<FleetForm | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FleetVehicle | null>(null);
  const [busy, setBusy] = useState(false);

  if (!db || !user) return null;

  const perms = permsFor(db, user, null);
  const canEdit = perms.isAdmin || user.is_team_commander;
  const types = db.vehicle_types.length ? db.vehicle_types : ['האמר'];

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const startNew = () => {
    setEditing(null);
    setF(blank(types[0]));
  };

  const startEdit = (v: FleetVehicle) => {
    setEditing(v.id);
    setF({ tz: v.tz, type: v.type, seats: v.seats, fitness: v.fitness, note: v.note, active: v.active });
  };

  return (
    <>
      <SectionCard
        title="צי הרכבים של היחידה"
        right={
          canEdit ? (
            <button className="btn btn-secondary" style={{ fontSize: 12.5 }} onClick={startNew}>
              הוספת רכב
            </button>
          ) : undefined
        }
      >
        <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
          רכב שנרשם כאן עם הצ׳ שלו נבחר אחר כך מרשימה בכל אימון — בלי להקליד אותו מחדש.
        </span>

        {db.fleet.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th>צ׳</th>
                  <th>סוג</th>
                  <th>מקומות</th>
                  <th>כשירות</th>
                  <th>הערה</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {db.fleet.map((v) => (
                  <tr key={v.id} style={{ opacity: v.active ? 1 : 0.5 }}>
                    <td className="tabnum">{v.tz}</td>
                    <td>{v.type}</td>
                    <td className="tabnum">{v.seats}</td>
                    <td
                      style={{
                        color: v.fitness === 'כשיר' ? 'var(--color-neutral-400)' : 'var(--color-accent-300)',
                      }}
                    >
                      {v.fitness}
                      {v.active ? '' : ' · לא בשימוש'}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>{v.note}</td>
                    {canEdit && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost" onClick={() => startEdit(v)}>
                          עריכה
                        </button>
                        <button className="btn btn-ghost" onClick={() => setRemoving(v)}>
                          הסרה
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!db.fleet.length && (
          <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>
            הצי ריק. {canEdit ? 'הוסף רכב אחד וכל אימון יוכל לבחור אותו.' : ''}
          </span>
        )}

        {f && canEdit && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 8,
              alignItems: 'end',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-neutral-900)',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              מספר צ׳
              <input
                className="input tabnum"
                inputMode="numeric"
                value={f.tz}
                onChange={(e) => setF({ ...f, tz: e.target.value })}
                placeholder="612345"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              סוג
              <input
                className="input"
                list="hapak-vehicle-types"
                value={f.type}
                onChange={(e) => setF({ ...f, type: e.target.value })}
              />
              <datalist id="hapak-vehicle-types">
                {types.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              מקומות
              <input
                className="input tabnum"
                type="number"
                min={1}
                value={f.seats}
                onChange={(e) => setF({ ...f, seats: Number(e.target.value) })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              כשירות
              <select
                className="input"
                value={f.fitness}
                onChange={(e) => setF({ ...f, fitness: e.target.value as FleetForm['fitness'] })}
              >
                {FITNESS_OPTIONS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              הערה
              <input
                className="input"
                value={f.note}
                onChange={(e) => setF({ ...f, note: e.target.value })}
                placeholder="למשל: טעון טיפול"
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, minHeight: 36 }}>
              <input
                type="checkbox"
                checked={f.active}
                onChange={(e) => setF({ ...f, active: e.target.checked })}
              />
              בשימוש
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await saveFleetVehicle(f, editing);
                    setF(null);
                    setEditing(null);
                  }, editing ? 'הרכב עודכן' : 'הרכב נוסף לצי')
                }
              >
                שמירה
              </button>
              <button className="btn btn-secondary" onClick={() => setF(null)}>
                ביטול
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {removing && (
        <ConfirmDialog
          open
          title={`להסיר את ${removing.type} צ׳ ${removing.tz} מהצי?`}
          body="אימונים שכבר נרשמו שומרים את הרכב כפי שהיה — ההסרה משפיעה רק על הרשימה לבחירה."
          confirmLabel="הסר"
          onClose={() => setRemoving(null)}
          onConfirm={() =>
            void run(async () => {
              await removeFleetVehicle(removing.id);
              setRemoving(null);
            }, 'הרכב הוסר מהצי')
          }
        />
      )}
    </>
  );
}
