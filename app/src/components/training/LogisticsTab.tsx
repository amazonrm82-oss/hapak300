'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { canDrive } from '@/lib/core/alerts';
import { FITNESS_OPTIONS, FOOD_CATALOG } from '@/lib/core/constants';
import { permsFor } from '@/lib/core/permissions';
import { fullName, participants, personById } from '@/lib/core/selectors';
import { VehicleTypeSelect } from '@/components/VehicleTypeSelect';
import type { FleetVehicle, GearItem, TrainingFull } from '@/lib/core/types';
import {
  addAmmo,
  addFood,
  addGear,
  addVehicle,
  removeRow,
  reportMissingGear,
  setAmmoField,
  setFoodField,
  setGearReturned,
  setVehicleField,
  signAmmo,
} from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

type Sub = 'gear' | 'vehicles' | 'ammo' | 'food';

export function LogisticsTab({ training: t }: { training: TrainingFull }) {
  const { db, user, toast, refresh } = useApp();
  const [sub, setSub] = useState<Sub>('gear');
  const [missingFor, setMissingFor] = useState<GearItem | null>(null);

  if (!db || !user) return null;

  const perms = permsFor(db, user, t);
  // the רס״פ maintains the logistics of any training, alongside its commanders
  const canEdit = perms.canLogistics && t.status !== 'cancelled';
  const ps = participants(db, t);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      await refresh();
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה');
    }
  };

  const tabs: [Sub, string][] = [
    ['gear', `ציוד (${t.gear.length})`],
    ['vehicles', `רכבים (${t.vehicles.length})`],
    ['ammo', `תחמושת (${t.ammo.length})`],
    ['food', `מזון ושתייה (${t.food.length})`],
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={`btn ${sub === id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSub(id)}
            style={{ whiteSpace: 'nowrap' }}
          >
            {label}
          </button>
        ))}
      </div>

      {sub === 'gear' && (
        <GearSection
          t={t}
          canEdit={canEdit}
          run={run}
          onReportMissing={setMissingFor}
          gearCatalog={db.gear_catalog}
        />
      )}
      {sub === 'vehicles' && (
        <VehiclesSection t={t} canEdit={canEdit} run={run} people={ps} types={db.vehicle_types} fleet={db.fleet} />
      )}
      {sub === 'ammo' && (
        <AmmoSection t={t} canEdit={canEdit} canSign={perms.canSignAmmo} canEnterUsed={perms.canSummarize} run={run} weapons={db.weapons} />
      )}
      {sub === 'food' && <FoodSection t={t} canEdit={canEdit} run={run} />}

      <MissingDialog
        item={missingFor}
        people={ps}
        onClose={() => setMissingFor(null)}
        onSave={(missing, ownerId) =>
          void run(() => reportMissingGear(missingFor!.id, missing, ownerId), 'דיווח החוסר נשמר').then(() =>
            setMissingFor(null),
          )
        }
      />
    </>
  );
}

// ── gear ───────────────────────────────────────────────────────────────────

function GearSection({
  t,
  canEdit,
  run,
  onReportMissing,
  gearCatalog,
}: {
  t: TrainingFull;
  canEdit: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  onReportMissing: (g: GearItem) => void;
  gearCatalog: string[];
}) {
  const { db } = useApp();
  const [name, setName] = useState('');
  const [custom, setCustom] = useState('');
  const [qty, setQty] = useState('');
  const returned = t.gear.filter((g) => g.returned).length;

  return (
    <>
      <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>
        צ׳קליסט החזרה בסוף האימון · {returned}/{t.gear.length} פריטים הוחזרו
      </span>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 700 }}>
          <thead>
            <tr>
              <th>פריט</th>
              <th>כמות</th>
              <th>החזרה</th>
              <th>חוסר / אחראי</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.gear.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td className="tabnum">{g.qty}</td>
                <td>
                  {canEdit && (
                    <button
                      className={`btn ${g.returned ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: 12, padding: '3px 10px', whiteSpace: 'nowrap' }}
                      onClick={() => void run(() => setGearReturned(g.id, !g.returned))}
                    >
                      {g.returned ? 'הוחזר' : 'סמן הוחזר'}
                    </button>
                  )}
                </td>
                <td style={{ fontSize: 12.5 }}>
                  {g.missing && (
                    <>
                      <span style={{ color: 'var(--color-accent-300)' }}>{g.missing}</span>
                      {g.owner_id && db && (
                        <span style={{ color: 'var(--color-neutral-500)' }}>
                          {' '}
                          · אחראי: {fullName(personById(db, g.owner_id))}
                        </span>
                      )}{' '}
                    </>
                  )}
                  {canEdit && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: '2px 6px', whiteSpace: 'nowrap' }}
                      onClick={() => onReportMissing(g)}
                    >
                      דיווח חוסר
                    </button>
                  )}
                </td>
                <td>
                  {canEdit && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12 }}
                      onClick={() => void run(() => removeRow('gear_items', g.id))}
                    >
                      הסר
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="input"
            style={{ width: 'auto', minWidth: 220 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
          >
            <option value="">הוספת פריט מהמאגר…</option>
            {gearCatalog.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
            <option value="__custom">פריט אחר…</option>
          </select>
          {name === '__custom' && (
            <input
              className="input"
              style={{ width: 220 }}
              placeholder="שם הפריט"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
          <input
            className="input"
            style={{ width: 90 }}
            placeholder="כמות"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <button
            className="btn btn-secondary"
            onClick={() =>
              void run(async () => {
                await addGear(db!, t.id, name === '__custom' ? custom : name, Number(qty) || 1);
                setName('');
                setCustom('');
                setQty('');
              })
            }
          >
            הוסף ציוד
          </button>
        </div>
      )}
    </>
  );
}

// ── vehicles ───────────────────────────────────────────────────────────────

function VehiclesSection({
  t,
  canEdit,
  run,
  people,
  types,
  fleet,
}: {
  t: TrainingFull;
  canEdit: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  people: ReturnType<typeof participants>;
  types: string[];
  fleet: FleetVehicle[];
}) {
  const [v, setV] = useState({ type: '', tz: '', driver_id: '', seats: '', departure: '' });
  // Two conditions, both required: marked a driver — which is a job on top of
  // whatever else he does — and a licence in date on the day of the training,
  // not today. A licence that expires the week before is not a licence on the
  // morning the convoy leaves.
  const licensed = people.filter((p) => (p.is_driver || p.role === 'נהג') && canDrive(p, t.date));
  const drivers = licensed.filter((p) => p.role === 'נהג');
  const others = licensed.filter((p) => p.role !== 'נהג');
  const unlicensed = people.length - licensed.length;
  const seats = t.vehicles.reduce((s, x) => s + (x.seats || 0), 0);

  return (
    <>
      <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>
        {seats} מקומות ל-{people.length} לוחמים · שיבוץ נהגים ידני על ידי מפקד האימון ·{' '}
        {licensed.length} בעלי רישיון בתוקף
        {unlicensed > 0
          ? ` (${unlicensed} אינם ניתנים לשיבוץ — לא מוגדרים נהגים או ללא הסמכת נהיגה בתוקף)`
          : ''}
      </span>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>רכב</th>
              <th>מספר צ׳</th>
              <th>נהג משויך</th>
              <th>מקומות</th>
              <th>שעת יציאה</th>
              <th>כשירות</th>
              <th>תקלה</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.vehicles.map((veh) => (
              <tr key={veh.id}>
                <td>
                  {canEdit ? (
                    <VehicleTypeSelect
                      value={veh.type}
                      types={types}
                      onChange={(type) => void run(() => setVehicleField(veh.id, 'type', type))}
                      style={{ width: 'auto', minWidth: 118, minHeight: 30, padding: '2px 8px' }}
                    />
                  ) : (
                    veh.type
                  )}
                </td>
                <td>
                  <input
                    className="input tabnum"
                    style={{ width: 96, minHeight: 30 }}
                    defaultValue={veh.tz}
                    disabled={!canEdit}
                    onBlur={(e) => void run(() => setVehicleField(veh.id, 'tz', e.target.value))}
                  />
                </td>
                <td>
                  <select
                    className="input"
                    style={{ width: 'auto', minHeight: 30, padding: '2px 8px' }}
                    value={veh.driver_id ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => void run(() => setVehicleField(veh.id, 'driver_id', e.target.value))}
                  >
                    <option value="">נהג — חובה לשבץ</option>
                    {drivers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {fullName(p)}
                      </option>
                    ))}
                    {others.map((p) => (
                      <option key={p.id} value={p.id}>
                        {fullName(p)} ({p.role})
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="input"
                    style={{ width: 64, minHeight: 30 }}
                    inputMode="numeric"
                    defaultValue={veh.seats}
                    disabled={!canEdit}
                    onBlur={(e) => void run(() => setVehicleField(veh.id, 'seats', e.target.value))}
                  />
                </td>
                <td>
                  <input
                    className="input tabnum"
                    style={{ width: 84, minHeight: 30 }}
                    defaultValue={veh.departure}
                    disabled={!canEdit}
                    onBlur={(e) => void run(() => setVehicleField(veh.id, 'departure', e.target.value))}
                  />
                </td>
                <td>
                  <select
                    className="input"
                    style={{ width: 'auto', minHeight: 30, padding: '2px 8px' }}
                    value={veh.fitness}
                    disabled={!canEdit}
                    onChange={(e) => void run(() => setVehicleField(veh.id, 'fitness', e.target.value))}
                  >
                    {FITNESS_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {veh.fitness !== 'כשיר' && (
                    <input
                      className="input"
                      style={{ width: 180, minHeight: 30 }}
                      placeholder="תיאור התקלה"
                      defaultValue={veh.fault}
                      disabled={!canEdit}
                      onBlur={(e) => void run(() => setVehicleField(veh.id, 'fault', e.target.value))}
                    />
                  )}
                </td>
                <td>
                  {canEdit && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12 }}
                      onClick={() => void run(() => removeRow('vehicles', veh.id))}
                    >
                      הסר
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && fleet.filter((x) => x.active).length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* One tap per vehicle the unit already registered, צ׳ and all. It
              fills the row below rather than adding straight away: a vehicle
              joins a training with a driver, or it does not join it. */}
          <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
            בחירה מהצי (ואז שבץ נהג):
          </span>
          {fleet
            .filter((x) => x.active)
            .map((x) => {
              const taken = t.vehicles.some((veh) => veh.tz === x.tz);
              return (
                <button
                  key={x.id}
                  className="btn btn-secondary"
                  disabled={taken}
                  style={{ fontSize: 12, minHeight: 32, padding: '4px 10px', opacity: taken ? 0.45 : 1 }}
                  onClick={() =>
                    setV({
                      type: x.type,
                      tz: x.tz,
                      driver_id: '',
                      seats: String(x.seats),
                      departure: t.departure,
                    })
                  }
                >
                  {taken ? '✓' : '+'} {x.type} · צ׳ {x.tz}
                  {x.fitness === 'כשיר' ? '' : ` · ${x.fitness}`}
                </button>
              );
            })}
        </div>
      )}

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* or set one up by hand */}
          {fleet.filter((x) => x.active).length > 0 && (
            <select
              className="input"
              style={{ width: 'auto', minWidth: 190 }}
              aria-label="בחירה מצי הרכבים"
              value=""
              onChange={(e) => {
                const pick = fleet.find((x) => x.id === e.target.value);
                if (pick)
                  setV((s) => ({ ...s, type: pick.type, tz: pick.tz, seats: String(pick.seats) }));
              }}
            >
              <option value="">בחר מצי הרכבים…</option>
              {fleet
                .filter((x) => x.active)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.type} · צ׳ {x.tz}
                    {x.fitness === 'כשיר' ? '' : ` · ${x.fitness}`}
                  </option>
                ))}
            </select>
          )}
          <select
            className="input"
            style={{ width: 'auto', minWidth: 160 }}
            value={v.type}
            onChange={(e) => setV((s) => ({ ...s, type: e.target.value }))}
          >
            <option value="">סוג רכב…</option>
            {/* a fleet vehicle may be of a type nobody added to the catalog */}
            {v.type && !types.includes(v.type) && <option value={v.type}>{v.type}</option>}
            {types.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ width: 110 }}
            placeholder="מספר צ׳"
            value={v.tz}
            onChange={(e) => setV((s) => ({ ...s, tz: e.target.value }))}
          />
          <select
            className="input"
            style={{ width: 'auto', minWidth: 160 }}
            value={v.driver_id}
            onChange={(e) => setV((s) => ({ ...s, driver_id: e.target.value }))}
          >
            <option value="">טרם שובץ</option>
            {licensed.map((p) => (
              <option key={p.id} value={p.id}>
                {fullName(p)}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ width: 90 }}
            placeholder="מקומות"
            inputMode="numeric"
            value={v.seats}
            onChange={(e) => setV((s) => ({ ...s, seats: e.target.value }))}
          />
          <input
            className="input"
            style={{ width: 90 }}
            placeholder="יציאה"
            value={v.departure}
            onChange={(e) => setV((s) => ({ ...s, departure: e.target.value }))}
          />
          {/* a vehicle with nobody driving it is a vehicle that stays in the
              yard — the rule is the same one the database enforces */}
          <button
            className="btn btn-secondary"
            disabled={!v.type || !v.driver_id}
            title={!v.driver_id ? 'שבץ נהג מוסמך לרכב' : undefined}
            onClick={() =>
              void run(async () => {
                await addVehicle(t.id, {
                  ...v,
                  seats: Number(v.seats) || 4,
                  departure: v.departure || t.departure,
                });
                setV({ type: '', tz: '', driver_id: '', seats: '', departure: '' });
              })
            }
          >
            הוסף רכב
          </button>
        </div>
      )}
    </>
  );
}

// ── ammunition ─────────────────────────────────────────────────────────────

function AmmoSection({
  t,
  canEdit,
  canSign,
  canEnterUsed,
  run,
  weapons,
}: {
  t: TrainingFull;
  canEdit: boolean;
  canSign: boolean;
  canEnterUsed: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  weapons: string[];
}) {
  const { db, user } = useApp();
  const [a, setA] = useState({ weapon: '', per: '', total: '' });
  const total = t.ammo.reduce((s, x) => s + x.allocated, 0);
  const n = db ? participants(db, t).length : 0;

  return (
    <>
      <div
        className="card"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: '10px 16px', flexWrap: 'wrap' }}
      >
        <span style={{ fontSize: 13 }}>
          {total.toLocaleString('en-US')} כד׳ סה״כ · {n} לוחמים
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>
          {t.ammo_signed
            ? `אושר בחתימת ${fullName(personById(db!, t.ammo_signed_by))} · ${t.ammo_signed_at ?? ''}`
            : 'ממתין לחתימת מפקד האימון'}
        </span>
        {canSign && t.status !== 'cancelled' && (
          <button
            className="btn btn-primary"
            style={{ marginInlineStart: 'auto' }}
            onClick={() =>
              void run(
                async () => {
                  const next = await signAmmo(t, user!);
                  return next;
                },
                t.ammo_signed ? 'החתימה הוסרה' : 'הקצאת התחמושת אושרה בחתימת מפקד האימון',
              )
            }
          >
            {t.ammo_signed ? 'הסר חתימה' : 'חתימת מפקד אימון'}
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 700 }}>
          <thead>
            <tr>
              <th>נשק</th>
              <th>כדורים ללוחם</th>
              <th>הקצאה (כדורים)</th>
              <th>נוצל בפועל</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.ammo.map((row) => (
              <tr key={row.id}>
                <td>{row.weapon}</td>
                <td>
                  <input
                    className="input tabnum"
                    style={{ width: 90, minHeight: 30 }}
                    inputMode="numeric"
                    placeholder="—"
                    defaultValue={row.per_fighter || ''}
                    disabled={!canEdit}
                    onBlur={(e) =>
                      void run(() => setAmmoField(db!, t, row.id, 'per_fighter', Number(e.target.value) || 0))
                    }
                  />
                </td>
                <td>
                  <input
                    className="input tabnum"
                    style={{ width: 110, minHeight: 30 }}
                    inputMode="numeric"
                    defaultValue={row.allocated}
                    disabled={!canEdit}
                    onBlur={(e) =>
                      void run(() => setAmmoField(db!, t, row.id, 'allocated', Number(e.target.value) || 0))
                    }
                  />
                </td>
                <td>
                  {canEnterUsed && (
                    <input
                      className="input tabnum"
                      style={{ width: 110, minHeight: 30 }}
                      inputMode="numeric"
                      placeholder="0"
                      defaultValue={row.used || ''}
                      onBlur={(e) =>
                        void run(() => setAmmoField(db!, t, row.id, 'used', Number(e.target.value) || 0))
                      }
                    />
                  )}
                </td>
                <td>
                  {canEdit && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12 }}
                      onClick={() => void run(() => removeRow('ammo', row.id))}
                    >
                      הסר
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="input"
            style={{ width: 'auto', minWidth: 180 }}
            value={a.weapon}
            onChange={(e) => setA((s) => ({ ...s, weapon: e.target.value }))}
          >
            <option value="">נשק…</option>
            {weapons.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ width: 130 }}
            placeholder="כדורים ללוחם"
            inputMode="numeric"
            value={a.per}
            onChange={(e) => setA((s) => ({ ...s, per: e.target.value }))}
          />
          <input
            className="input"
            style={{ width: 130 }}
            placeholder="או סה״כ כדורים"
            inputMode="numeric"
            value={a.total}
            onChange={(e) => setA((s) => ({ ...s, total: e.target.value }))}
          />
          <button
            className="btn btn-secondary"
            onClick={() =>
              void run(async () => {
                await addAmmo(db!, t, a.weapon, Number(a.per) || 0, Number(a.total) || 0);
                setA({ weapon: '', per: '', total: '' });
              })
            }
          >
            הוסף תחמושת
          </button>
        </div>
      )}
    </>
  );
}

// ── food ───────────────────────────────────────────────────────────────────

function FoodSection({
  t,
  canEdit,
  run,
}: {
  t: TrainingFull;
  canEdit: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
}) {
  const [f, setF] = useState({ name: '', custom: '', unit: '', qty: '' });

  return (
    <>
      <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>
        הכמויות ידניות — עדכן לפי מספר המגיעים
      </span>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 700 }}>
          <thead>
            <tr>
              <th>פריט</th>
              <th>כמות</th>
              <th>יחידה</th>
              <th>הערה (כשרות / מגבלות)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.food.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>
                  <input
                    className="input tabnum"
                    style={{ width: 90, minHeight: 30 }}
                    inputMode="numeric"
                    defaultValue={row.qty}
                    disabled={!canEdit}
                    onBlur={(e) => void run(() => setFoodField(row.id, 'qty', e.target.value))}
                  />
                </td>
                <td style={{ color: 'var(--color-neutral-400)' }}>{row.unit}</td>
                <td>
                  <input
                    className="input"
                    style={{ minHeight: 30 }}
                    placeholder="לדוגמה: 2 צמחוניים, 3 ג׳ריקנים"
                    defaultValue={row.note}
                    disabled={!canEdit}
                    onBlur={(e) => void run(() => setFoodField(row.id, 'note', e.target.value))}
                  />
                </td>
                <td>
                  {canEdit && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12 }}
                      onClick={() => void run(() => removeRow('food', row.id))}
                    >
                      הסר
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="input"
            style={{ width: 'auto', minWidth: 200 }}
            value={f.name}
            onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))}
          >
            <option value="">פריט מזון…</option>
            {FOOD_CATALOG.map((x) => (
              <option key={x.name} value={x.name}>
                {x.name} ({x.unit})
              </option>
            ))}
            <option value="__custom">פריט אחר…</option>
          </select>
          {f.name === '__custom' && (
            <>
              <input
                className="input"
                style={{ width: 180 }}
                placeholder="שם הפריט"
                value={f.custom}
                onChange={(e) => setF((s) => ({ ...s, custom: e.target.value }))}
              />
              <input
                className="input"
                style={{ width: 110 }}
                placeholder="יחידה"
                value={f.unit}
                onChange={(e) => setF((s) => ({ ...s, unit: e.target.value }))}
              />
            </>
          )}
          <input
            className="input"
            style={{ width: 90 }}
            placeholder="כמות"
            inputMode="numeric"
            value={f.qty}
            onChange={(e) => setF((s) => ({ ...s, qty: e.target.value }))}
          />
          <button
            className="btn btn-secondary"
            onClick={() =>
              void run(async () => {
                const known = FOOD_CATALOG.find((x) => x.name === f.name);
                await addFood(t.id, {
                  name: f.name === '__custom' ? f.custom.trim() : f.name,
                  qty: Number(f.qty) || 1,
                  unit: known?.unit ?? f.unit ?? 'יח׳',
                });
                setF({ name: '', custom: '', unit: '', qty: '' });
              })
            }
          >
            הוסף
          </button>
        </div>
      )}
    </>
  );
}

// ── missing-gear report ────────────────────────────────────────────────────

function MissingDialog({
  item,
  people,
  onClose,
  onSave,
}: {
  item: GearItem | null;
  people: ReturnType<typeof participants>;
  onClose: () => void;
  onSave: (missing: string, ownerId: string) => void;
}) {
  const [missing, setMissing] = useState('');
  const [ownerId, setOwnerId] = useState('');

  // reopening for a different item must not inherit the previous report
  useEffect(() => {
    setMissing(item?.missing ?? '');
    setOwnerId(item?.owner_id ?? '');
  }, [item]);

  if (!item) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      width={520}
      title={`דיווח חוסר · ${item.name}`}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button className="btn btn-primary" onClick={() => onSave(missing, ownerId)}>
            שמור דיווח
          </button>
        </>
      }
    >
      <Field label="תיאור החוסר">
        <input
          className="input"
          value={missing}
          onChange={(e) => setMissing(e.target.value)}
          placeholder="לדוגמה: חסר מכשיר קשר אחד, סוללה פגומה"
        />
      </Field>
      <Field label="אחראי">
        <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">ללא אחראי</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {fullName(p)}
            </option>
          ))}
        </select>
      </Field>
    </Dialog>
  );
}
