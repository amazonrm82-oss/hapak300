'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SettingsDialog } from '@/components/dialogs/SettingsDialog';
import { TrainingFormDialog } from '@/components/dialogs/TrainingFormDialog';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { AuditLog } from '@/components/AuditLog';
import { PeriodCard } from '@/components/PeriodCard';
import { Field, SectionCard, Tag } from '@/components/ui/bits';
import { TRAINING_STATUS, WEEKDAYS } from '@/lib/core/constants';
import { pad, weekOf } from '@/lib/core/dates';
import { fullName, periodWeeks, personById, trainingTitle } from '@/lib/core/selectors';
import type { RotationConfig, TrainingFull, TrainingTeam } from '@/lib/core/types';
import {
  addQuickTraining,
  addTopic,
  clearTrainings,
  deleteTraining,
  duplicateTraining,
  patchTraining,
  removeTopic,
  runRotation,
  saveSettings,
  saveTopic,
  shiftSchedule,
} from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

/**
 * Period management — the administrator and the HQ-party commander only.
 * Everything about when a training happens is edited here, in the row itself.
 */
export default function ManagePage() {
  const { db, user, perms, toast, refresh } = useApp();
  const router = useRouter();
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TrainingFull | null>(null);
  const [fullFormOpen, setFullFormOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');

  if (!db || !user) return null;

  if (!perms.canManagePeriod)
    return (
      <span style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
        ניהול התקופה שמור למנהל המערכת ולמפקד החפ״ק.
      </span>
    );

  const rows = [...db.trainings].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
  );

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      await refresh();
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה');
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 26, margin: '0 0 4px' }}>ניהול התקופה</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-500)' }}>
            מנהל מערכת ומפקד החפ״ק · עריכה ישירה של תאריכים, שעות, צוות, נושא ומיקום לכל אימון ·{' '}
            {rows.length} אימונים · {periodWeeks(db)} שבועות
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setGeneratorOpen(true)} style={{ whiteSpace: 'nowrap' }}>
            יצירת סבב אוטומטי
          </button>
          <button className="btn btn-secondary" onClick={() => setShiftOpen(true)} style={{ whiteSpace: 'nowrap' }}>
            הזזת כל הלו״ז
          </button>
          <button className="btn btn-secondary" onClick={() => setSettingsOpen(true)} style={{ whiteSpace: 'nowrap' }}>
            שמות צוותים והגדרות
          </button>
          <button className="btn btn-ghost" onClick={() => setClearOpen(true)} style={{ whiteSpace: 'nowrap' }}>
            התחלה מתבנית ריקה
          </button>
        </div>
      </div>

      <section
        className="card"
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, padding: '12px 16px', flexWrap: 'wrap' }}
      >
        <Field label="שם התקופה" style={{ minWidth: 220 }}>
          <input
            className="input"
            defaultValue={db.settings.period_name}
            placeholder="לדוגמה: חורף 2026"
            onBlur={(e) => void run(() => saveSettings({ period_name: e.target.value }), 'שם התקופה עודכן')}
          />
        </Field>
        <Field label="תחילת התקופה (שבוע 01)" style={{ minWidth: 200 }}>
          <input
            className="input"
            type="date"
            defaultValue={db.settings.period_start}
            onBlur={(e) =>
              e.target.value &&
              void run(
                () => saveSettings({ period_start: e.target.value }),
                'תחילת התקופה עודכנה — מספרי השבועות חושבו מחדש',
              )
            }
          />
        </Field>
        <span
          style={{
            fontSize: 12,
            color: 'var(--color-neutral-500)',
            paddingBottom: 10,
            maxWidth: 420,
            textWrap: 'pretty',
          }}
        >
          מספרי השבועות בלו״ז נגזרים מתאריך זה.
        </span>
      </section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>הוספת אימון:</span>
        {(['a', 'b', 'joint'] as TrainingTeam[]).map((tm) => (
          <button
            key={tm}
            className="btn btn-secondary"
            style={{ whiteSpace: 'nowrap' }}
            onClick={() =>
              void run(() => addQuickTraining(db, tm), 'נוספה שורה — ערוך תאריך, שעות, נושא ומיקום בטבלה')
            }
          >
            + שורה {tm === 'joint' ? 'משותפת' : `ל${db.teams[tm].name}`}
          </button>
        ))}
        <button className="btn btn-ghost" onClick={() => setFullFormOpen(true)} style={{ whiteSpace: 'nowrap' }}>
          + אימון מלא (טופס)
        </button>
        <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
          שורה מהירה נוצרת שבוע אחרי האימון האחרון של הצוות, עם לוגיסטיקה ברירת מחדל
        </span>
      </div>

      <div style={{ overflowX: 'auto', maxWidth: '100%', paddingBottom: 4 }}>
        <table className="table" style={{ minWidth: 1100 }}>
          <thead>
            <tr>
              <th>שבוע</th>
              <th>אימון</th>
              <th>צוות</th>
              <th>נושא</th>
              <th>תאריך</th>
              <th>התחלה</th>
              <th>סיום</th>
              <th>מיקום</th>
              <th>מדריך</th>
              <th>סטטוס</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const locked = t.status === 'done' || t.status === 'cancelled';
              return (
                <tr key={t.id}>
                  <td className="tabnum" style={{ color: 'var(--color-neutral-400)' }}>
                    {pad(Math.max(0, weekOf(db.settings.period_start, t.date)))}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{trainingTitle(db, t)}</td>
                  <td>
                    <select
                      className="input"
                      style={{ width: 'auto', minHeight: 30, padding: '2px 8px', fontSize: 12.5 }}
                      value={t.team_id}
                      disabled={locked}
                      onChange={(e) => void run(() => patchTraining(db, t, 'team_id', e.target.value))}
                    >
                      <option value="a">{db.teams.a.name}</option>
                      <option value="b">{db.teams.b.name}</option>
                      <option value="joint">משותף</option>
                    </select>
                  </td>
                  <td>
                    <select
                      className="input"
                      style={{ width: 'auto', maxWidth: 190, minHeight: 30, padding: '2px 8px', fontSize: 12.5 }}
                      value={t.topic_id}
                      disabled={locked}
                      onChange={(e) => void run(() => patchTraining(db, t, 'topic_id', e.target.value))}
                    >
                      {db.topics.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input tabnum"
                      type="date"
                      style={{ width: 150, minHeight: 30, fontSize: 12.5 }}
                      defaultValue={t.date}
                      disabled={locked}
                      onBlur={(e) =>
                        e.target.value !== t.date &&
                        e.target.value &&
                        void run(() => patchTraining(db, t, 'date', e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="time"
                      style={{ width: 92, minHeight: 30, fontSize: 12.5 }}
                      defaultValue={t.start}
                      disabled={locked}
                      onBlur={(e) =>
                        e.target.value !== t.start &&
                        e.target.value &&
                        void run(() => patchTraining(db, t, 'start', e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="time"
                      style={{ width: 92, minHeight: 30, fontSize: 12.5 }}
                      defaultValue={t.end}
                      disabled={locked}
                      onBlur={(e) =>
                        e.target.value !== t.end &&
                        e.target.value &&
                        void run(() => patchTraining(db, t, 'end', e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      style={{ minWidth: 130, minHeight: 30, fontSize: 12.5 }}
                      defaultValue={t.location}
                      placeholder="מיקום"
                      disabled={locked}
                      onBlur={(e) =>
                        e.target.value !== t.location &&
                        void run(() => patchTraining(db, t, 'location', e.target.value))
                      }
                    />
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--color-neutral-400)', whiteSpace: 'nowrap' }}>
                    {fullName(personById(db, t.instructor_id))}
                  </td>
                  <td>
                    <Tag kind={t.status === 'cancelled' ? 'outline' : t.status === 'done' ? 'accent' : 'neutral'}>
                      {TRAINING_STATUS[t.status]}
                    </Tag>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: '2px 6px' }}
                        onClick={() => router.push(`/trainings/${t.id}`)}
                      >
                        פתח
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: '2px 6px' }}
                        onClick={() => void run(() => duplicateTraining(db, t), 'נוצר עותק')}
                      >
                        שכפל
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: '2px 6px' }}
                        onClick={() => setDeleteTarget(t)}
                      >
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!rows.length && (
        <div
          style={{
            border: '1px dashed var(--color-neutral-800)',
            borderRadius: 'var(--radius-md)',
            padding: 20,
            textAlign: 'center',
            color: 'var(--color-neutral-500)',
            fontSize: 13,
          }}
        >
          אין אימונים — צור סבב אוטומטי או הוסף שורות
        </div>
      )}

      <SectionCard
        title="נושאי אימון והוראות בטיחות (תבנית לפי נושא)"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="input"
              placeholder="נושא חדש"
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              style={{ minHeight: 32, width: 220 }}
            />
            <button
              className="btn btn-secondary"
              onClick={() =>
                void run(async () => {
                  await addTopic(db, newTopicName);
                  setNewTopicName('');
                }, 'הנושא נוסף')
              }
            >
              הוסף נושא
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {db.topics.map((tp) => {
            const used = db.trainings.filter((t) => t.topic_id === tp.id).length;
            return (
              <div
                key={tp.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '220px minmax(0,1fr) auto auto',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <input
                  className="input"
                  defaultValue={tp.name}
                  style={{ minHeight: 32, fontSize: 13 }}
                  onBlur={(e) => e.target.value !== tp.name && void run(() => saveTopic(tp.id, { name: e.target.value }))}
                />
                <input
                  className="input"
                  defaultValue={tp.safety}
                  placeholder="הוראות בטיחות ברירת מחדל לנושא"
                  style={{ minHeight: 32, fontSize: 12.5 }}
                  onBlur={(e) =>
                    e.target.value !== tp.safety && void run(() => saveTopic(tp.id, { safety: e.target.value }))
                  }
                />
                <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)', whiteSpace: 'nowrap' }}>
                  {used} אימונים
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => void run(() => removeTopic(db, tp.id), 'הנושא הוסר')}
                >
                  הסר
                </button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <PeriodCard />

      <AuditLog />

      <RotationDialog open={generatorOpen} onClose={() => setGeneratorOpen(false)} />
      <ShiftDialog open={shiftOpen} onClose={() => setShiftOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <TrainingFormDialog open={fullFormOpen} training={null} onClose={() => setFullFormOpen(false)} />

      <ConfirmDialog
        open={clearOpen}
        title="למחוק את כל האימונים ולהתחיל מתבנית ריקה?"
        body="האנשים, הצוותים, הנושאים וההגדרות נשמרים. אימונים שהסתיימו נשארים בארכיון. אחר כך אפשר ליצור סבב אוטומטי או להוסיף אימונים ידנית."
        confirmLabel="מחק את הלו״ז"
        onClose={() => setClearOpen(false)}
        onConfirm={() =>
          void run(clearTrainings, 'כל האימונים נמחקו — התבנית ריקה').then(() => setClearOpen(false))
        }
      />

      {deleteTarget && (
        <ConfirmDialog
          open
          title={`למחוק לצמיתות את ${trainingTitle(db, deleteTarget)}?`}
          body="המחיקה סופית ואינה נשמרת בארכיון. כדי לבטל אימון ולשמור אותו בארכיון — השתמש ב״ביטול״ במסך האימון."
          confirmLabel="מחק לצמיתות"
          onClose={() => setDeleteTarget(null)}
          onConfirm={() =>
            void run(() => deleteTraining(deleteTarget.id), 'האימון נמחק לצמיתות').then(() =>
              setDeleteTarget(null),
            )
          }
        />
      )}
    </>
  );
}

// ── rotation generator ─────────────────────────────────────────────────────

function RotationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, toast, refresh } = useApp();
  const [f, setF] = useState<RotationConfig>({
    start: '',
    weekday: '3',
    start_time: '07:00',
    end_time: '17:00',
    team_weeks: 6,
    joint_weeks: 4,
    stagger: true,
    location: '',
    topics: [],
    joint_topics: [],
    replace: true,
  });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open || !db) return null;

  // seed from the current period the first time the dialog opens
  if (!ready) {
    setF((s) => ({
      ...s,
      start: db.settings.period_start,
      location: db.locations[0] ?? '',
      topics: db.topics.slice(0, 6).map((t) => t.id),
      joint_topics: db.topics.slice(6, 10).map((t) => t.id),
    }));
    setReady(true);
  }

  const toggle = (key: 'topics' | 'joint_topics', id: string) =>
    setF((s) => {
      const q = new Set(s[key]);
      if (q.has(id)) q.delete(id);
      else q.add(id);
      // keep the topic order from the catalogue, not the click order
      return { ...s, [key]: db.topics.map((t) => t.id).filter((x) => q.has(x)) };
    });

  const count = f.team_weeks * 2 + f.joint_weeks;
  const weeks = Number(f.team_weeks) + (f.stagger ? 1 : 0) + Number(f.joint_weeks);

  return (
    <Dialog
      open
      onClose={onClose}
      title="יצירת תבנית סבב אוטומטית"
      body="צוות א׳ מתאמן לפי סדר הנושאים, צוות ב׳ עושה את אותו אימון שבוע אחרי (סבב מדורג), ואז שבועות משותפים. מדריכים מוסמכים משובצים כהזמנה ממתינה ומפקדי הצוותים כמפקדי אימון — הכול ניתן לעריכה אחר כך."
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const n = await runRotation(db, f);
                await refresh();
                toast(
                  `נוצרו ${n} אימונים — ${f.team_weeks} שבועות סבב לצוות${f.stagger ? ' (מדורג)' : ''} + ${f.joint_weeks} משותפים`,
                );
                onClose();
              } catch (e) {
                toast(e instanceof Error ? e.message : 'יצירת הסבב נכשלה');
              } finally {
                setBusy(false);
              }
            }}
          >
            צור את התבנית
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label="תאריך התחלה">
          <input
            className="input"
            type="date"
            value={f.start}
            onChange={(e) => setF((s) => ({ ...s, start: e.target.value }))}
          />
        </Field>
        <Field label="יום האימון בשבוע">
          <select
            className="input"
            value={String(f.weekday)}
            onChange={(e) => setF((s) => ({ ...s, weekday: e.target.value }))}
          >
            {WEEKDAYS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="מיקום ברירת מחדל">
          <input
            className="input"
            value={f.location}
            onChange={(e) => setF((s) => ({ ...s, location: e.target.value }))}
            placeholder="ניתן לשנות לכל אימון"
          />
        </Field>
        <Field label="שעת התחלה">
          <input
            className="input"
            type="time"
            value={f.start_time}
            onChange={(e) => setF((s) => ({ ...s, start_time: e.target.value }))}
          />
        </Field>
        <Field label="שעת סיום">
          <input
            className="input"
            type="time"
            value={f.end_time}
            onChange={(e) => setF((s) => ({ ...s, end_time: e.target.value }))}
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="שבועות סבב">
            <input
              className="input tabnum"
              inputMode="numeric"
              value={String(f.team_weeks)}
              onChange={(e) => setF((s) => ({ ...s, team_weeks: Number(e.target.value) || 0 }))}
            />
          </Field>
          <Field label="משותפים">
            <input
              className="input tabnum"
              inputMode="numeric"
              value={String(f.joint_weeks)}
              onChange={(e) => setF((s) => ({ ...s, joint_weeks: Number(e.target.value) || 0 }))}
            />
          </Field>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={f.stagger}
          onChange={(e) => setF((s) => ({ ...s, stagger: e.target.checked }))}
        />
        סבב מדורג — צוות ב׳ שבוע אחרי צוות א׳ (ללא סימון: שני הצוותים באותו שבוע)
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={f.replace}
          onChange={(e) => setF((s) => ({ ...s, replace: e.target.checked }))}
        />
        החלף את האימונים הקיימים (אימונים שהסתיימו נשמרים בארכיון)
      </label>

      <TopicPicker
        label="נושאי סבב הצוותים — לפי הסדר ברשימה"
        topics={db.topics}
        selected={f.topics}
        onToggle={(id) => toggle('topics', id)}
      />
      <TopicPicker
        label="נושאי האימון המשותף"
        topics={db.topics}
        selected={f.joint_topics}
        onToggle={(id) => toggle('joint_topics', id)}
      />

      <span style={{ fontSize: 12.5, color: 'var(--color-accent-300)' }}>
        {count} אימונים ייווצרו · {weeks} שבועות
      </span>
    </Dialog>
  );
}

function TopicPicker({
  label,
  topics,
  selected,
  onToggle,
}: {
  label: string;
  topics: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {topics.map((t) => (
          <label
            key={t.id}
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
            <input type="checkbox" checked={selected.includes(t.id)} onChange={() => onToggle(t.id)} />
            {t.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function ShiftDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast, refresh } = useApp();
  const [days, setDays] = useState('7');

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      width={560}
      title="הזזת כל הלו״ז"
      body="כל האימונים שטרם הסתיימו יוזזו במספר הימים שתזין: 7 = שבוע קדימה, ‎-7 = שבוע אחורה. נוכחות שכבר סומנה באימונים מפורסמים תאופס והצוות יקבל התראה."
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              try {
                await shiftSchedule(parseInt(days, 10));
                await refresh();
                toast(`הלו״ז הוזז ב-${days} ימים`);
                onClose();
              } catch (e) {
                toast(e instanceof Error ? e.message : 'ההזזה נכשלה');
              }
            }}
          >
            הזז את הלו״ז
          </button>
        </>
      }
    >
      <Field label="מספר ימים">
        <input
          className="input tabnum"
          inputMode="numeric"
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </Field>
    </Dialog>
  );
}
