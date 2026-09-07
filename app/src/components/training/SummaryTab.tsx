'use client';

import { useState } from 'react';
import { FeedbackDialog } from '@/components/dialogs/FeedbackDialog';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Field, SectionCard, Tag } from '@/components/ui/bits';
import { summaryLocked } from '@/lib/core/alerts';
import { permsFor } from '@/lib/core/permissions';
import { fullName, participants, personById } from '@/lib/core/selectors';
import type { TrainingFull } from '@/lib/core/types';
import { addPhoto, finishTraining, removeRow, setSummaryField } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

export function SummaryTab({ training: t }: { training: TrainingFull }) {
  const { db, user, today, toast, refresh } = useApp();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

  if (!db || !user) return null;

  const perms = permsFor(db, user, t);
  const locked = !(perms.canSummarize || perms.isInstr) || summaryLocked(db, t, user, today);
  const isPart = participants(db, t).some((p) => p.id === user.id);
  const canGiveFeedback = t.status === 'done' && isPart;
  const myFb = t.feedback[user.id];
  const fbValues = Object.values(t.feedback);
  const seesFeedback = perms.seesFeedback && t.status === 'done';

  const avg = (key: 'overall' | 'instructor' | 'logistics') => {
    const xs = fbValues.map((f) => f[key]).filter(Boolean);
    return xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : '—';
  };

  const ammoUsed = t.ammo.reduce((s, a) => s + (a.used || 0), 0);
  const ammoTotal = t.ammo.reduce((s, a) => s + a.allocated, 0);

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
      {canGiveFeedback && (
        <div
          className="card"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: '10px 16px',
            flexWrap: 'wrap',
            boxShadow: '0 0 0 1px var(--color-accent-700)',
          }}
        >
          <span style={{ fontSize: 13, flex: 1, minWidth: 240 }}>
            {myFb
              ? `המשוב שלך: כללי ${myFb.overall}/5 · מדריך ${myFb.instructor || '—'}/5 · לוגיסטיקה ${myFb.logistics || '—'}/5`
              : 'האימון הסתיים — נשמח למשוב קצר (נראה למפקדים ולמדריך)'}
          </span>
          <button className="btn btn-primary" onClick={() => setFeedbackOpen(true)} style={{ whiteSpace: 'nowrap' }}>
            {myFb ? 'עדכון משוב' : 'משוב על האימון'}
          </button>
        </div>
      )}

      {seesFeedback && (
        <SectionCard
          title={`משוב לוחמים · ${fbValues.length} משובים מתוך ${participants(db, t).length} לוחמים`}
          right={
            <span style={{ fontSize: 12.5, color: 'var(--color-accent-300)' }}>
              {fbValues.length
                ? `ממוצע: כללי ${avg('overall')} · מדריך ${avg('instructor')} · לוגיסטיקה ${avg('logistics')}`
                : 'אין משובים עדיין'}
            </span>
          }
        >
          {Object.entries(t.feedback).map(([pid, f]) => (
            <div
              key={pid}
              style={{
                display: 'grid',
                gridTemplateColumns: '200px 120px 1fr',
                gap: 10,
                fontSize: 12.5,
                padding: '4px 0',
                borderBottom: '1px solid var(--color-neutral-900)',
              }}
            >
              <span>{fullName(personById(db, pid))}</span>
              <span className="tabnum" style={{ color: 'var(--color-neutral-400)' }}>
                {f.overall} · {f.instructor || '—'} · {f.logistics || '—'}
              </span>
              <span style={{ color: 'var(--color-neutral-300)' }}>{f.comment}</span>
            </div>
          ))}
          <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
            ציונים: כללי · מדריך · לוגיסטיקה (1–5) · נראה למפקדים ולמדריך בלבד
          </span>
        </SectionCard>
      )}

      {summaryLocked(db, t, user, today) && (
        <span style={{ fontSize: 12.5, color: 'var(--color-accent-300)' }}>
          הסיכום ננעל — עבר שבוע מהאימון. מנהל המערכת או מפקד החפ״ק יכולים עדיין לערוך.
        </span>
      )}

      <div className="hapak-summary">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="סיכום מפקד האימון (רשות)">
            <textarea
              className="input"
              rows={4}
              placeholder="מה בוצע, רמת הביצוע, אירועים חריגים"
              defaultValue={t.summary.commander}
              disabled={locked}
              onBlur={(e) => void run(() => setSummaryField(t, 'commander', e.target.value))}
            />
          </Field>
          <Field label="הערות המדריך">
            <textarea
              className="input"
              rows={3}
              placeholder="הערות מקצועיות על רמת הלוחמים"
              defaultValue={t.summary.instructor}
              disabled={locked}
              onBlur={(e) => void run(() => setSummaryField(t, 'instructor', e.target.value))}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="לקחים לשימור">
              <textarea
                className="input"
                rows={3}
                defaultValue={t.summary.keep}
                disabled={locked}
                onBlur={(e) => void run(() => setSummaryField(t, 'keep', e.target.value))}
              />
            </Field>
            <Field label="לקחים לשיפור">
              <textarea
                className="input"
                rows={3}
                defaultValue={t.summary.improve}
                disabled={locked}
                onBlur={(e) => void run(() => setSummaryField(t, 'improve', e.target.value))}
              />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {perms.canSummarize && t.status !== 'done' && t.status !== 'cancelled' && (
              <button className="btn btn-primary" onClick={() => setFinishOpen(true)}>
                סיים אימון והעבר לארכיון
              </button>
            )}
            {t.status === 'done' && <Tag kind="accent">האימון בארכיון</Tag>}
            <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>
              תחמושת שנוצלה: {ammoUsed.toLocaleString('en-US')} מתוך {ammoTotal.toLocaleString('en-US')} כד׳
              (מוזן בלשונית תחמושת על ידי מפקד האימון)
            </span>
          </div>
        </div>

        <SectionCard
          title="תמונות מהאימון"
          right={
            isPart ? (
              <label className="btn btn-secondary" style={{ cursor: 'pointer', fontSize: 12 }}>
                הוסף תמונה
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void run(() => addPhoto(t.id, user.id, file), 'התמונה נוספה');
                  }}
                />
              </label>
            ) : undefined
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            {t.photos.map((p) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--color-neutral-500)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                  {(p.by === user.id || perms.canEdit) && (
                    <button
                      onClick={() => void run(() => removeRow('photos', p.id))}
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: 'var(--color-accent)',
                        cursor: 'pointer',
                        fontSize: 11,
                        padding: 0,
                        fontFamily: 'inherit',
                      }}
                    >
                      הסר
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
          {!t.photos.length && (
            <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>
              כל הצוות יכול להעלות תמונות לסיכום.
            </span>
          )}
        </SectionCard>
      </div>

      {feedbackOpen && <FeedbackDialog training={t} onClose={() => setFeedbackOpen(false)} />}

      <ConfirmDialog
        open={finishOpen}
        title="לסיים את האימון ולהעבירו לארכיון?"
        body="הסיכום, הנוכחות הסופית והתחמושת שנוצלה יישמרו בארכיון. אפשר להמשיך לערוך את הסיכום מהארכיון."
        confirmLabel="סיים אימון"
        onClose={() => setFinishOpen(false)}
        onConfirm={() =>
          void run(() => finishTraining(t.id), 'האימון הועבר לארכיון').then(() => setFinishOpen(false))
        }
      />

      <style jsx>{`
        .hapak-summary {
          display: grid;
          grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 1000px) {
          .hapak-summary {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </>
  );
}
