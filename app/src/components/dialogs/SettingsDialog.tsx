'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { ROLES } from '@/lib/core/constants';
import { saveSettings } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, toast, refresh } = useApp();
  const [f, setF] = useState({
    app_name: '',
    unit_name: '',
    brigade_commander: '',
    team_a: '',
    team_b: '',
    min_attendance: '6',
    essential_roles: [] as string[],
    real_mode: true,
    allow_join: true,
    evening_reminder: '18:00',
    morning_reminder_before: '120',
    invite_hours: '48',
    cert_alert_days: '30',
    summary_lock_days: '7',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !db) return;
    const s = db.settings;
    setF({
      app_name: s.app_name,
      unit_name: s.unit_name,
      brigade_commander: s.brigade_commander,
      team_a: db.teams.a.name,
      team_b: db.teams.b.name,
      min_attendance: String(s.min_attendance),
      essential_roles: [...s.essential_roles],
      real_mode: s.real_mode,
      allow_join: s.allow_join,
      evening_reminder: s.evening_reminder,
      morning_reminder_before: String(s.morning_reminder_before),
      invite_hours: String(s.invite_hours),
      cert_alert_days: String(s.cert_alert_days),
      summary_lock_days: String(s.summary_lock_days),
    });
  }, [open, db]);

  if (!open || !db) return null;

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const toggleRole = (role: string) =>
    setF((s) => {
      const q = new Set(s.essential_roles);
      if (q.has(role)) q.delete(role);
      else q.add(role);
      return { ...s, essential_roles: [...q] };
    });

  async function save() {
    setBusy(true);
    try {
      await saveSettings({
        app_name: f.app_name.trim() || db!.settings.app_name,
        unit_name: f.unit_name.trim() || db!.settings.unit_name,
        brigade_commander: f.brigade_commander.trim(),
        min_attendance: Math.max(1, Number(f.min_attendance) || 6),
        essential_roles: f.essential_roles,
        allow_join: f.allow_join,
        evening_reminder: f.evening_reminder,
        morning_reminder_before: Number(f.morning_reminder_before) || 120,
        invite_hours: Number(f.invite_hours) || 48,
        cert_alert_days: Number(f.cert_alert_days) || 30,
        summary_lock_days: Number(f.summary_lock_days) || 7,
        team_a: f.team_a.trim(),
        team_b: f.team_b.trim(),
      });
      await refresh();
      toast('ההגדרות נשמרו');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'שמירת ההגדרות נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="הגדרות מערכת"
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            שמירה
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="שם המערכת">
          <input className="input" value={f.app_name} onChange={set('app_name')} />
        </Field>
        <Field label="שם היחידה">
          <input className="input" value={f.unit_name} onChange={set('unit_name')} />
        </Field>
        <Field label="שם צוות א׳">
          <input className="input" value={f.team_a} onChange={set('team_a')} />
        </Field>
        <Field label="שם צוות ב׳">
          <input className="input" value={f.team_b} onChange={set('team_b')} />
        </Field>
        <Field label="המח״ט (ביומן)">
          <input className="input" value={f.brigade_commander} onChange={set('brigade_commander')} />
        </Field>
        <Field label="סף נוכחות מינימלי לאימון צוות">
          <input
            className="input tabnum"
            inputMode="numeric"
            value={f.min_attendance}
            onChange={set('min_attendance')}
          />
        </Field>
        <Field label="תזכורת ערב לפני (שעה)">
          <input className="input" type="time" value={f.evening_reminder} onChange={set('evening_reminder')} />
        </Field>
        <Field label="תזכורת בוקר — דקות לפני היציאה">
          <input
            className="input tabnum"
            inputMode="numeric"
            value={f.morning_reminder_before}
            onChange={set('morning_reminder_before')}
          />
        </Field>
        <Field label="מענה להזמנה (שעות)">
          <input className="input tabnum" inputMode="numeric" value={f.invite_hours} onChange={set('invite_hours')} />
        </Field>
        <Field label="התרעת הסמכה (ימים לפני)">
          <input
            className="input tabnum"
            inputMode="numeric"
            value={f.cert_alert_days}
            onChange={set('cert_alert_days')}
          />
        </Field>
        <Field label="נעילת סיכום (ימים אחרי האימון)">
          <input
            className="input tabnum"
            inputMode="numeric"
            value={f.summary_lock_days}
            onChange={set('summary_lock_days')}
          />
        </Field>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={f.allow_join} onChange={set('allow_join')} />
        לאפשר ״בקשת הצטרפות״ ממסך הכניסה (לאישור מנהל / מפקד חפ״ק)
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
          תפקידים חיוניים — חסרונם מקפיץ אזהרה למפקד. נהג אינו ברשימה: הוא נדרש רק
          באימון שיש בו רכב, ואז נבדק לפי ההסמכה בתוקף.
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ROLES.filter((r) => r !== 'מפקד צוות' && r !== 'נהג').map((r) => (
            <label
              key={r}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12.5,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-neutral-800)',
              }}
            >
              <input
                type="checkbox"
                checked={f.essential_roles.includes(r)}
                onChange={() => toggleRole(r)}
              />
              {r}
            </label>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
