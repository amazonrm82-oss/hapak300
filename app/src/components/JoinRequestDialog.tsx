'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { RANKS, ROLES } from '@/lib/core/constants';
import type { TeamKey } from '@/lib/core/types';
import { useApp } from '@/lib/data/provider';
import { submitJoinRequest } from '@/lib/data/mutations';

/** Open to anyone on the login screen; grants nothing until an admin approves. */
export function JoinRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, toast } = useApp();
  const [f, setF] = useState({
    name: '',
    rank: 'טוראי',
    role: 'מאבטח',
    pn: '',
    phone: '',
    team_id: 'a' as TeamKey,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function send() {
    setErr('');
    setBusy(true);
    try {
      await submitJoinRequest(f);
      toast('הבקשה נשלחה למנהל המערכת ולמפקד החפ״ק');
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שליחת הבקשה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="בקשת הצטרפות"
      body="הבקשה נשלחת למנהל המערכת ולמפקד החפ״ק לאישור."
      width={560}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button className="btn btn-primary" onClick={() => void send()} disabled={busy}>
            שלח בקשה
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="שם מלא" style={{ gridColumn: 'span 2' }}>
          <input className="input" value={f.name} onChange={set('name')} />
        </Field>
        <Field label="מספר אישי">
          <input
            className="input tabnum"
            inputMode="numeric"
            maxLength={7}
            value={f.pn}
            onChange={(e) => setF((s) => ({ ...s, pn: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
          />
        </Field>
        <Field label="טלפון">
          <input className="input" value={f.phone} onChange={set('phone')} placeholder="050-0000000" />
        </Field>
        <Field label="דרגה">
          <select className="input" value={f.rank} onChange={set('rank')}>
            {RANKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="תפקיד">
          <select className="input" value={f.role} onChange={set('role')}>
            {ROLES.filter((r) => r !== 'מפקד צוות').map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="צוות מבוקש" style={{ gridColumn: 'span 2' }}>
          <select className="input" value={f.team_id} onChange={set('team_id')}>
            <option value="a">{db?.teams.a.name ?? 'צוות א׳'}</option>
            <option value="b">{db?.teams.b.name ?? 'צוות ב׳'}</option>
            <option value="c">{db?.teams.c.name ?? 'סדיר'}</option>
          </select>
        </Field>
      </div>
      {err && <span style={{ fontSize: 12.5, color: 'var(--color-accent-300)' }}>{err}</span>}
    </Dialog>
  );
}
