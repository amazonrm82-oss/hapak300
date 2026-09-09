'use client';

import { useEffect, useState } from 'react';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { CERT_TYPES, NVG_TYPES, SIGHT_TYPES, RANK_FULL, RANKS } from '@/lib/core/constants';
import {
  canEditPerson,
  canGrantRights,
  canSetStaff,
  permsFor,
  rolesFor,
} from '@/lib/core/permissions';
import { fullName } from '@/lib/core/selectors';
import type { Person } from '@/lib/core/types';
import { removePerson, resetPin, revokeSessions, savePerson, type PersonForm } from '@/lib/data/mutations';
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
  is_driver: false,
  qual: [],
  certs: {},
  weapon: '',
  weapon_serial: '',
  nvg: '',
  nvg_serial: '',
  sight: '',
  sight_serial: '',
  medical_profile: '',
  limitations: '',
  absent_from: '',
  absent_to: '',
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
        is_driver: person.is_driver,
        qual: [...person.qual],
        certs: Object.fromEntries(CERT_TYPES.map(([k]) => [k, person.certs[k] ?? ''])),
        weapon: person.weapon ?? '',
        weapon_serial: person.weapon_serial ?? '',
        nvg: person.nvg ?? '',
        nvg_serial: person.nvg_serial ?? '',
        sight: person.sight ?? '',
        sight_serial: person.sight_serial ?? '',
        medical_profile: person.medical_profile ? String(person.medical_profile) : '',
        limitations: person.limitations ?? '',
        absent_from: person.absent_from ?? '',
        absent_to: person.absent_to ?? '',
      });
    } else {
      setF(emptyForm());
    }
  }, [open, person]);

  if (!open || !db || !user) return null;

  const perms = permsFor(db, user, null);
  // an HQ-party commander may not act on an administrator — the rank above them
  const locked = !!person && !canEditPerson(user, person);
  // a team commander edits his team's cards in full, but appoints nobody: the
  // four rights below are what would put someone alongside or above him
  const canRights = canGrantRights(user);
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
            {person && perms.canManagePeople && person.id !== user.id && !locked && (
              <button className="btn btn-ghost" onClick={() => setConfirmRemove(true)}>
                הסרה מהמערכת
              </button>
            )}
            {person && perms.canManagePeople && !locked && (
              <button
                className="btn btn-ghost"
                title="מכשיר שאבד או הושאל — כל הסשנים הפתוחים נסגרים מיד"
                onClick={async () => {
                  try {
                    await revokeSessions(person.id);
                    await refresh();
                    toast(`כל המכשירים של ${fullName(person)} נותקו — הכניסה הבאה תדרוש את הקוד`);
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'הניתוק נכשל');
                  }
                }}
              >
                ניתוק כל המכשירים
              </button>
            )}
            {person?.has_pin && !locked && (
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
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy || locked}>
              שמירה
            </button>
          </>
        }
      >
        {locked && (
          <span
            style={{
              fontSize: 12.5,
              lineHeight: 1.6,
              color: 'var(--color-accent-300)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-neutral-900)',
            }}
          >
            {fullName(person!)} הוא מנהל מערכת — דרגת ההרשאה מעל מפקד החפ״ק. עריכה, הסרה או איפוס קוד
            שמורים למנהל מערכת בלבד.
          </span>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="שם מלא" style={{ gridColumn: 'span 2' }}>
            <input className="input" value={f.name} onChange={set('name')} />
          </Field>
          <Field label="דרגה">
            <select className="input" value={f.rank} onChange={set('rank')}>
              {RANKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                  {RANK_FULL[r] ? ` · ${RANK_FULL[r]}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="תפקיד בכוח">
            <select className="input" value={f.role} onChange={set('role')}>
              {rolesFor(user).map((r) => (
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
              <option value="c">{db.teams.c.name}</option>
              {/* The מפקדה is a table of organisation: מח״ט וסמח״ט, ומי שמנהל
                  את המערכת. שיבוץ אליה שמור למנהל המערכת ולמפקד החפ״ק. */}
              {canSetStaff(user) && <option value="">מפקדה (ללא צוות)</option>}
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
          <Field label="נשק אישי">
            <select className="input" value={f.weapon} onChange={set('weapon')}>
              <option value="">לא הוזן</option>
              {db.weapons.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </Field>
          <Field label="מספר נשק (צ׳)">
            <input
              className="input tabnum"
              value={f.weapon_serial}
              onChange={set('weapon_serial')}
              placeholder="נראה למפקדים וללוחם עצמו בלבד"
            />
          </Field>
          <Field label="נהיגה" style={{ gridColumn: 'span 2' }}>
            <Check
              checked={f.is_driver}
              onChange={set('is_driver')}
              label="נהג — ניתן לשבץ כנהג רכב, בנוסף לתפקידו (נדרשת גם הסמכת נהיגה בתוקף)"
            />
          </Field>

          <Field label="אמר״ל">
            <input className="input" list="hapak-nvg-full" value={f.nvg} onChange={set('nvg')} />
            <datalist id="hapak-nvg-full">
              {NVG_TYPES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label="מספר אמר״ל (צ׳)">
            <input className="input tabnum" value={f.nvg_serial} onChange={set('nvg_serial')} />
          </Field>

          <Field label="כוונת">
            <input className="input" list="hapak-sight-full" value={f.sight} onChange={set('sight')} />
            <datalist id="hapak-sight-full">
              {SIGHT_TYPES.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label="מספר כוונת (צ׳)">
            <input className="input tabnum" value={f.sight_serial} onChange={set('sight_serial')} />
          </Field>

          <Field label="פרופיל רפואי (21–97)">
            <input
              className="input tabnum"
              inputMode="numeric"
              maxLength={2}
              value={f.medical_profile}
              onChange={(e) =>
                setF((s) => ({ ...s, medical_profile: e.target.value.replace(/\D/g, '').slice(0, 2) }))
              }
              placeholder="ריק = לא הוזן"
            />
          </Field>
          <Field label="מגבלות">
            <input
              className="input"
              value={f.limitations}
              onChange={set('limitations')}
              placeholder="למשל: פטור מריצה עד 01/2027"
            />
          </Field>
          <Field label="היעדרות — מתאריך">
            <input className="input" type="date" value={f.absent_from} onChange={set('absent_from')} />
          </Field>
          <Field label="ועד תאריך (ריק = פתוח)">
            <input
              className="input"
              type="date"
              value={f.absent_to}
              onChange={set('absent_to')}
              disabled={!f.absent_from}
            />
          </Field>
          <span
            style={{ gridColumn: 'span 2', fontSize: 12, color: 'var(--color-neutral-500)', marginTop: -4 }}
          >
            קורס, אשפוז או חו״ל. בטווח הזה הוא אינו נספר על אימון, אינו מקבל תזכורות
            ואינו מקבל אפס על אימון שלא היה יכול להגיע אליו.
          </span>

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
          {!canRights && (
            <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
              מינוי מפקד צוות, מדריך, מפקד חפ״ק ומנהל מערכת שמור למפקד החפ״ק ולמנהל המערכת.
            </span>
          )}
          {canRights && (
            <Check
              checked={f.is_team_commander}
              onChange={set('is_team_commander')}
              label="מפקד צוות — מאשר נוכחות סופית, יוצר אימונים ומזמין מדריכים (מחליף את מפקד הצוות הנוכחי)"
            />
          )}
          {canRights && (
            <Check
              checked={f.is_instructor}
              onChange={set('is_instructor')}
              label="מדריך — ניתן להזמין להדרכה (הסמכות לפי נושא למטה)"
            />
          )}
          {perms.canGrantRoles && (
            <>
              <Check
                checked={f.is_hapak_commander}
                onChange={set('is_hapak_commander')}
                label="מפקד החפ״ק — ניהול מלא: אנשים, הרשאות, תאריכים ושעות של כל אימון"
              />
              {perms.isSysAdmin ? (
                <Check
                  checked={f.is_admin}
                  onChange={set('is_admin')}
                  label="מנהל מערכת — ניהול מלא והגדרות, ודרגת הרשאה מעל מפקד החפ״ק"
                />
              ) : (
                <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  מינוי מנהל מערכת שמור למנהל מערכת בלבד.
                </span>
              )}
            </>
          )}
        </div>

        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          hidden={!canRights}
        >
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
