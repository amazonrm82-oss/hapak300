'use client';

import { useState } from 'react';

/**
 * Picking the vehicle type — האמר, RZR, רוביקון and the rest of the catalog.
 *
 * This was a free-text box with an autocomplete list, which on a phone looks
 * exactly like a box you have to type into: nobody could tell there was a
 * choice. It is a real dropdown now, with "אחר" for a type the unit has not
 * added to the catalog yet.
 */
export function VehicleTypeSelect({
  value,
  types,
  onChange,
  style,
  label = 'סוג רכב',
}: {
  value: string;
  types: string[];
  onChange: (next: string) => void;
  style?: React.CSSProperties;
  label?: string;
}) {
  const [manual, setManual] = useState(false);
  const listed = types.includes(value);

  if (manual || (!!value && !listed))
    return (
      <span style={{ display: 'flex', gap: 4, ...style }}>
        <input
          className="input"
          aria-label={label}
          placeholder={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="חזרה לרשימה"
          title="חזרה לרשימה"
          onClick={() => {
            setManual(false);
            onChange(types[0] ?? '');
          }}
          style={{ flex: 'none' }}
        >
          ↩
        </button>
      </span>
    );

  return (
    <select
      className="input"
      aria-label={label}
      value={value}
      onChange={(e) => {
        if (e.target.value === '__other') {
          setManual(true);
          onChange('');
        } else {
          onChange(e.target.value);
        }
      }}
      style={style}
    >
      <option value="">{label}…</option>
      {types.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
      <option value="__other">אחר — הקלדה…</option>
    </select>
  );
}
