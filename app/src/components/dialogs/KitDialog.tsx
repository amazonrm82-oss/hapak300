'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { CERT_TYPES, NVG_TYPES, SIGHT_TYPES } from '@/lib/core/constants';
import { fullName } from '@/lib/core/selectors';
import type { Person } from '@/lib/core/types';
import { saveKit, type KitForm } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

interface Props {
  open: boolean;
  person: Person | null;
  onClose: () => void;
}

/**
 * The סמל צוות's card: weapon, its serial and the certifications.
 *
 * A short form rather than the full one with everything else greyed out. The
 * database allows him exactly these three columns, and a form that offers only
 * what it is allowed to send cannot fail halfway through a save — or quietly
 * carry a field he is not entitled to see.
 */
export function KitDialog({ open, person, onClose }: Props) {
  const { db, toast, refresh } = useApp();
  const [f, setF] = useState<KitForm>({
    weapon: '',
    weapon_serial: '',
    nvg: '',
    nvg_serial: '',
    sight: '',
    sight_serial: '',
    certs: {},
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !person) return;
    setF({
      weapon: person.weapon ?? '',
      weapon_serial: person.weapon_serial ?? '',
      nvg: person.nvg ?? '',
      nvg_serial: person.nvg_serial ?? '',
      sight: person.sight ?? '',
      sight_serial: person.sight_serial ?? '',
      certs: Object.fromEntries(CERT_TYPES.map(([k]) => [k, person.certs[k] ?? ''])),
    });
  }, [open, person]);

  if (!open || !db || !person) return null;

  async function save() {
    setBusy(true);
    try {
      await saveKit(person!.id, f);
      await refresh();
      toast('הפרטים נשמרו');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`נשק, אמר״ל והכשרות · ${fullName(person)}`}
      body="סמל צוות מעדכן נשק, אמר״ל והכשרות. שאר הפרטים שמורים למפקד החפ״ק ולמנהל המערכת."
      width={560}
      actions={
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          שמירה
        </button>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        <Field label="נשק אישי">
          <select
            className="input"
            value={f.weapon}
            onChange={(e) => setF((s) => ({ ...s, weapon: e.target.value }))}
          >
            <option value="">לא הוזן</option>
            {db.weapons.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </Field>
        <Field label="מספר נשק">
          <input
            className="input tabnum"
            value={f.weapon_serial}
            onChange={(e) => setF((s) => ({ ...s, weapon_serial: e.target.value }))}
            placeholder="הצ׳ של הנשק"
          />
        </Field>
        <Field label="אמר״ל">
          <input
            className="input"
            list="hapak-nvg"
            value={f.nvg}
            onChange={(e) => setF((s) => ({ ...s, nvg: e.target.value }))}
            placeholder="סוג האמר״ל"
          />
          <datalist id="hapak-nvg">
            {NVG_TYPES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field label="מספר אמר״ל">
          <input
            className="input tabnum"
            value={f.nvg_serial}
            onChange={(e) => setF((s) => ({ ...s, nvg_serial: e.target.value }))}
            placeholder="הצ׳ של האמר״ל"
          />
        </Field>
        <Field label="כוונת">
          <input
            className="input"
            list="hapak-sight"
            value={f.sight}
            onChange={(e) => setF((s) => ({ ...s, sight: e.target.value }))}
            placeholder="סוג הכוונת"
          />
          <datalist id="hapak-sight">
            {SIGHT_TYPES.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
        <Field label="מספר כוונת">
          <input
            className="input tabnum"
            value={f.sight_serial}
            onChange={(e) => setF((s) => ({ ...s, sight_serial: e.target.value }))}
            placeholder="הצ׳ של הכוונת"
          />
        </Field>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
          הסמכות אישיות — תאריך תפוגה (ריק = לא הוזן) · התרעה {db.settings.cert_alert_days} יום לפני
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
          {CERT_TYPES.map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                className="input"
                type="date"
                value={f.certs[k] ?? ''}
                onChange={(e) => setF((s) => ({ ...s, certs: { ...s.certs, [k]: e.target.value } }))}
                style={{ minHeight: 34, fontSize: 12.5 }}
              />
            </Field>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
