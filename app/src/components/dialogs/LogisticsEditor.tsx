'use client';

import type { NewAmmo, NewFood, NewGear, NewVehicle } from '@/lib/core/defaults';
import { VehicleTypeSelect } from '@/components/VehicleTypeSelect';
import { FITNESS_OPTIONS } from '@/lib/core/constants';
import type { Db } from '@/lib/core/types';

export interface LogisticsDraft {
  gear: NewGear[];
  vehicles: NewVehicle[];
  ammo: NewAmmo[];
  food: NewFood[];
}

interface Props {
  db: Db;
  value: LogisticsDraft;
  onChange: (next: LogisticsDraft) => void;
  onReset: () => void;
}

/**
 * Gear, vehicles, ammunition and food — filled in while the training is being
 * created, not afterwards.
 *
 * The system proposes a full set from the topic and the roster size; this is
 * where the commander corrects it before anyone sees it. Whatever is saved here
 * is what the whole team gets, and it stays editable later on the training's
 * own logistics tab.
 */
export function LogisticsEditor({ db, value, onChange, onReset }: Props) {
  const patch = (part: Partial<LogisticsDraft>) => onChange({ ...value, ...part });

  const fleet = db.fleet.filter((v) => v.active);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)', flex: 1, minWidth: 200 }}>
          המערכת מילאה הצעה לפי הנושא וגודל הכוח. ערוך כאן — מה שיישמר יוצג לכל הצוות.
        </span>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onReset}>
          החזר להצעת המערכת
        </button>
      </div>

      {/* ── ציוד ── */}
      <Section
        title="ציוד נדרש"
        count={value.gear.length}
        onAdd={() =>
          patch({
            gear: [...value.gear, { name: '', qty: 1, returned: false, missing: '', owner_id: null }],
          })
        }
      >
        {value.gear.map((g, i) => (
          <Row key={i} onRemove={() => patch({ gear: value.gear.filter((_, j) => j !== i) })}>
            <input
              className="input"
              list="hapak-gear-catalog"
              placeholder="פריט"
              value={g.name}
              onChange={(e) => patch({ gear: replace(value.gear, i, { ...g, name: e.target.value }) })}
              style={{ flex: 1, minWidth: 140 }}
            />
            <input
              className="input tabnum"
              type="number"
              min={1}
              aria-label="כמות"
              value={g.qty}
              onChange={(e) =>
                patch({ gear: replace(value.gear, i, { ...g, qty: Number(e.target.value) || 1 }) })
              }
              style={{ width: 84 }}
            />
          </Row>
        ))}
        <datalist id="hapak-gear-catalog">
          {db.gear_catalog.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Section>

      {/* ── רכבים ── */}
      <Section
        title="רכבים"
        count={value.vehicles.length}
        onAdd={() =>
          patch({
            vehicles: [
              ...value.vehicles,
              {
                type: fleet[0]?.type ?? db.vehicle_types[0] ?? 'האמר',
                tz: fleet[0]?.tz ?? '',
                driver_id: null,
                seats: fleet[0]?.seats ?? 6,
                departure: value.vehicles[0]?.departure ?? '05:30',
                fitness: 'כשיר',
                fault: '',
              },
            ],
          })
        }
      >
        {fleet.length === 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
            צי הרכבים ריק — אפשר להקליד צ׳ ידנית, או להוסיף רכבים פעם אחת במסך הלוגיסטיקה ולבחור
            אותם מכאן.
          </span>
        )}
        {value.vehicles.map((v, i) => (
          <Row key={i} onRemove={() => patch({ vehicles: value.vehicles.filter((_, j) => j !== i) })}>
            {fleet.length > 0 && (
              <select
                className="input"
                aria-label="בחירה מהצי"
                value={fleet.some((x) => x.tz === v.tz) ? v.tz : ''}
                onChange={(e) => {
                  const pick = fleet.find((x) => x.tz === e.target.value);
                  patch({
                    vehicles: replace(
                      value.vehicles,
                      i,
                      pick
                        ? { ...v, tz: pick.tz, type: pick.type, seats: pick.seats, fitness: pick.fitness }
                        : { ...v, tz: '' },
                    ),
                  });
                }}
                style={{ flex: 1, minWidth: 160 }}
              >
                <option value="">בחר מהצי / הקלדה ידנית</option>
                {fleet.map((x) => (
                  <option key={x.id} value={x.tz}>
                    {x.type} · צ׳ {x.tz}
                    {x.fitness === 'כשיר' ? '' : ` · ${x.fitness}`}
                  </option>
                ))}
              </select>
            )}
            <VehicleTypeSelect
              label="סוג"
              value={v.type}
              types={db.vehicle_types}
              onChange={(type) => patch({ vehicles: replace(value.vehicles, i, { ...v, type }) })}
              style={{ width: 132 }}
            />
            <input
              className="input tabnum"
              placeholder="צ׳"
              value={v.tz}
              onChange={(e) => patch({ vehicles: replace(value.vehicles, i, { ...v, tz: e.target.value }) })}
              style={{ width: 96 }}
            />
            <input
              className="input tabnum"
              type="number"
              min={1}
              aria-label="מקומות"
              value={v.seats}
              onChange={(e) =>
                patch({ vehicles: replace(value.vehicles, i, { ...v, seats: Number(e.target.value) || 1 }) })
              }
              style={{ width: 74 }}
            />
            <select
              className="input"
              aria-label="נהג"
              value={v.driver_id ?? ''}
              onChange={(e) =>
                patch({
                  vehicles: replace(value.vehicles, i, { ...v, driver_id: e.target.value || null }),
                })
              }
              style={{ width: 150 }}
            >
              <option value="">נהג — לא שובץ</option>
              {db.people
                .filter((p) => p.status === 'active')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.rank} {p.name}
                    {p.role === 'נהג' ? ' · נהג' : ''}
                  </option>
                ))}
            </select>
            <select
              className="input"
              aria-label="כשירות"
              value={v.fitness}
              onChange={(e) =>
                patch({
                  vehicles: replace(value.vehicles, i, {
                    ...v,
                    fitness: e.target.value as NewVehicle['fitness'],
                  }),
                })
              }
              style={{ width: 120 }}
            >
              {FITNESS_OPTIONS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Row>
        ))}
      </Section>

      {/* ── תחמושת ── */}
      <Section
        title="תחמושת"
        count={value.ammo.length}
        onAdd={() =>
          patch({
            ammo: [
              ...value.ammo,
              { weapon: db.weapons[0] ?? '', per_fighter: 0, allocated: 0, used: 0 },
            ],
          })
        }
      >
        {value.ammo.length > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
            ״לוחם״ = כדורים ללוחם; ״סה״כ״ = מה שמונפק בפועל ונחתם בשטח.
          </span>
        )}
        {value.ammo.map((a, i) => (
          <Row key={i} onRemove={() => patch({ ammo: value.ammo.filter((_, j) => j !== i) })}>
            <input
              className="input"
              list="hapak-weapons"
              placeholder="אמצעי"
              value={a.weapon}
              onChange={(e) => patch({ ammo: replace(value.ammo, i, { ...a, weapon: e.target.value }) })}
              style={{ flex: 1, minWidth: 140 }}
            />
            <label style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
              לוחם
              <input
                className="input tabnum"
                type="number"
                min={0}
                value={a.per_fighter}
                onChange={(e) =>
                  patch({
                    ammo: replace(value.ammo, i, { ...a, per_fighter: Number(e.target.value) || 0 }),
                  })
                }
                style={{ width: 84 }}
              />
            </label>
            <label style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
              סה״כ
              <input
                className="input tabnum"
                type="number"
                min={0}
                value={a.allocated}
                onChange={(e) =>
                  patch({
                    ammo: replace(value.ammo, i, { ...a, allocated: Number(e.target.value) || 0 }),
                  })
                }
                style={{ width: 96 }}
              />
            </label>
          </Row>
        ))}
        <datalist id="hapak-weapons">
          {db.weapons.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Section>

      {/* ── מזון ומים ── */}
      <Section
        title="מזון ומים"
        count={value.food.length}
        onAdd={() => patch({ food: [...value.food, { name: '', qty: 1, unit: 'יח׳', note: '' }] })}
      >
        {value.food.map((x, i) => (
          <Row key={i} onRemove={() => patch({ food: value.food.filter((_, j) => j !== i) })}>
            <input
              className="input"
              placeholder="פריט (מים, מנות קרב…)"
              value={x.name}
              onChange={(e) => patch({ food: replace(value.food, i, { ...x, name: e.target.value }) })}
              style={{ flex: 1, minWidth: 140 }}
            />
            <input
              className="input tabnum"
              type="number"
              min={0}
              aria-label="כמות"
              value={x.qty}
              onChange={(e) =>
                patch({ food: replace(value.food, i, { ...x, qty: Number(e.target.value) || 0 }) })
              }
              style={{ width: 84 }}
            />
            <input
              className="input"
              aria-label="יחידה"
              placeholder="ליטר / מנות"
              value={x.unit}
              onChange={(e) => patch({ food: replace(value.food, i, { ...x, unit: e.target.value }) })}
              style={{ width: 96 }}
            />
            <input
              className="input"
              aria-label="הערה"
              placeholder="הערה"
              value={x.note}
              onChange={(e) => patch({ food: replace(value.food, i, { ...x, note: e.target.value }) })}
              style={{ width: 130 }}
            />
          </Row>
        ))}
      </Section>
    </div>
  );
}

function replace<T>(list: T[], i: number, item: T): T[] {
  return list.map((x, j) => (j === i ? item : x));
}

function Section({
  title,
  count,
  onAdd,
  children,
}: {
  title: string;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <details open={count > 0} style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 8 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1 }}>
          {title} <span style={{ color: 'var(--color-neutral-500)' }}>({count})</span>
        </span>
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {children}
        <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start', fontSize: 12 }} onClick={onAdd}>
          + הוספת שורה
        </button>
      </div>
    </details>
  );
}

function Row({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {children}
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        onClick={onRemove}
        aria-label="הסרת שורה"
        style={{ flex: 'none' }}
      >
        ✕
      </button>
    </div>
  );
}
