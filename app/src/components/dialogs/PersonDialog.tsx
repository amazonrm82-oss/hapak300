'use client';

import { useEffect, useState } from 'react';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { CERT_TYPES, RANKS, ROLES } from '@/lib/core/constants';
import { permsFor } from '@/lib/core/permissions';
import { fullName } from '@/lib/core/selectors';
import type { Person } from '@/lib/core/types';
import { removePerson, resetPin, savePerson, type PersonForm } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

interface Props {
  open: boolean;
  person: Person | null; // null = new
  onClose: () => void;
}

const emptyForm = (): PersonForm => ({
  name: '',
  rank: 'סמל',
  role: 'מאבטח',
  pn: '',
  phone: '',
  team_id: 'a',
  rating: 7,
  status: 'active',
  status_note: '',
  is_team_commander: false,
  is_instructor: false,
  is_admin: false,
  is_hapak_commander: false,
  qual: [],
  certs: {},
});

/**
 * The full fighter form: details, status, account type and rights, instructing
 * certifications by topic, personal certifications with expiry, and the PIN reset.
 */
export function PersonDialog({ open, person, onClose }: Props) {
  const { db, user, toast, refresh } = useApp();
  const [f, setF] = useState<PersonForm>(emptyForm);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (person) {
      setF({
        name: person.name,
        rank: person.rank,
        role: person.role,
        pn: person.pn,
        phone: person.phone,
        team_id: person.team_id ?? '',
        rating: person.rating,
        status: person.status,
        status_note: person.status_note,
        is_team_commander: person.is_team_commander,
        is_instructor: person.is_instructor,
        is_admin: person.is_admin,
        is_hapak_commander: person.is_hapak_commander,
        qual: [...person.qual],
        certs: Object.fromEntries(CERT_TYPES.map(([k]) => [k, person.certs[k] ?? ''])),
      });
    } else {
      setF(emptyForm());
    }
  }, [open, person]);

  if (!open || !db || !user) return null;

  const perms = permsFor(db, user, null);
  const set =
    <K extends keyof PersonForm>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF((s) => ({
        ...s,
        [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value,
      }));

  const toggleQual = (topicId: string) =>
    setF((s) => {
      const q = new Set(s.qual);
      if (q.has(topicId)) q.delete(topicId);
      else q.add(topicId);
      return { ...s, qual: [...q], is_instructor: q.size > 0 ? true : s.is_instructor };
    });

  async function save() {
    setBusy(true);
    try {
      await savePerson(db!, user!, { ...f, rating: Number(f.rating) || 7 }, person?.id ?? null);
      await refresh();
      toast(person ? 'הפרטים נשמרו' : `${f.rank} ${f.name} נוסף למערכת`);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'שמירת הפרטים נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={person ? 'עריכת לוחם' : 'הוספת לוחם'}
        actions={
          <>
            {person && perms.canManagePeople && person.id !== user.id && (
              <button className="btn btn-ghost" onClick={() => setConfirmRemove(true)}>
                הסרה מהמערכת
              </button>
            )}
            {person?.has_pin && (
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  try {
                    await resetPin(person.id);
                    await refresh();
                    toast(`קוד הכניסה של ${fullName(person)} אופס — בכניסה הבאה יבחר קוד חדש`);
                    onClose();
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'איפוס הקוד נכשל');
                  }
                }}
              >
                איפוס קוד כניסה
              </button>
            )}
            <span style={{ flex: 1 }} />
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
          <Field label="שם מלא" style={{ gridColumn: 'span 2' }}>
            <input className="input" value={f.name} onChange={set('name')} />
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
          <Field label="תפקיד בכוח">
            <select className="input" value={f.role} onChange={set('role')}>
              {ROLES.filter((r) => r !== 'מפקד צוות').map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="מספר אישי (7 ספרות)">
            <input
              className="input tabnum"
              inputMode="numeric"
              maxLength={7}
              value={f.pn}
              onChange={(e) => setF((s) => ({ ...s, pn: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
            />
          </Field>
          <Field label="טלפון">
            <input className="input" value={f.phone} onChange={set('phone')} placeholder="052-000-0000" />
          </Field>
          <Field label="צוות">
            <select className="input" value={f.team_id} onChange={set('team_id')}>
              <option value="a">{db.teams.a.name}</option>
              <option value="b">{db.teams.b.name}</option>
              <option value="">מפקדה (ללא צוות)</option>
            </select>
          </Field>
          <Field label="דירוג מפקד תקופתי (1–10)">
            <select className="input" value={String(f.rating)} onChange={set('rating')}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="סטטוס">
            <select className="input" value={f.status} onChange={set('status')}>
              <option value="active">פעיל</option>
              <option value="inactive">מושבת זמנית (פצוע / חו״ל)</option>
            </select>
          </Field>
          {f.status === 'inactive' && (
            <Field label="סיבת ההשבתה">
              <input
                className="input"
                value={f.status_note}
                onChange={set('status_note')}
                placeholder="פצוע / חו״ל עד תאריך"
              />
            </Field>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-neutral-900)',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
            סוג משתמש והרשאות — ללא סימון: לוחם (רואה לו״ז, מסמן נוכחות לעצמו)
          </span>
          <Check
            checked={f.is_team_commander}
            onChange={set('is_team_commander')}
            label="מפקד צוות — מאשר נוכחות סופית, יוצר אימונים ומזמין מדריכים (מחליף את מפקד הצוות הנוכחי)"
          />
          <Check
            checked={f.is_instructor}
            onChange={set('is_instructor')}
            label="מדריך — ניתן להזמין להדרכה (הסמכות לפי נושא למטה)"
          />
          {perms.canGrantRoles && (
            <>
              <Check
                checked={f.is_hapak_commander}
                onChange={set('is_hapak_commander')}
                label="מפקד החפ״ק — ניהול מלא: אנשים, הרשאות, תאריכים ושעות של כל אימון"
              />
              <Check
                checked={f.is_admin}
                onChange={set('is_admin')}
                label="מנהל מערכת — ניהול מלא והגדרות"
              />
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
            הסמכות הדרכה (סימון נושא הופך אותו למדריך מוסמך)
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {db.topics.map((topic) => (
              <label
                key={topic.id}
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
                  checked={f.qual.includes(topic.id)}
                  onChange={() => toggleQual(topic.id)}
                />
                {topic.name}
              </label>
            ))}
          </div>
        </div>

        {perms.canEditCerts && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
              הסמכות אישיות — תאריך תפוגה (ריק = לא הוזן) · התרעה {db.settings.cert_alert_days} יום לפני · אזהרה בלבד, לא חוסם שיבוץ
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
        )}
      </Dialog>

      {person && (
        <ConfirmDialog
          open={confirmRemove}
          title={`להסיר את ${fullName(person)} מהמערכת?`}
          body="הנוכחות שסומנה באימונים שהסתיימו נשמרת בארכיון. פעולה זו זמינה למנהל המערכת ולמפקד החפ״ק בלבד."
          confirmLabel="הסר"
          onClose={() => setConfirmRemove(false)}
          onConfirm={async () => {
            try {
              await removePerson(person.id);
              await refresh();
              toast('הלוחם הוסר מהמערכת');
              setConfirmRemove(false);
              onClose();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'ההסרה נכשלה');
            }
          }}
        />
      )}
    </>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
}) {
  return (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', minHeight: 28 }}
    >
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}
