'use client';

import { useState } from 'react';
import { Field, SectionCard } from '@/components/ui/bits';
import { ConfirmDialog } from '@/components/ui/Dialog';
import {
  DRILL_KINDS,
  SCORE_COLOR,
  resultScore,
  scoreTone,
  scoresFor,
  trainingScore,
} from '@/lib/core/drills';
import { drillsHTML, printHTML } from '@/lib/core/exports';
import { permsFor } from '@/lib/core/permissions';
import { fullName, participants } from '@/lib/core/selectors';
import type { Drill, TrainingFull } from '@/lib/core/types';
import {
  clearDrillResult,
  removeDrill,
  saveDrill,
  saveDrillResult,
  setAttendanceRating,
  setTrainingGrade,
  type DrillForm,
} from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

const blankDrill = (): DrillForm => ({
  name: '',
  description: '',
  kind: 'hits',
  rounds: 0,
  weight: 1,
});

/**
 * מקצים — what the training was actually made of, and what each fighter did.
 *
 * A shooting day is ירי בעמידה, then ירי בתנועה, then something else. Each
 * station is recorded on its own, per fighter, and the training's score is what
 * those add up to. A fighter with no result at a station is not scored zero for
 * it: "did not shoot" and "missed everything" are different facts, and treating
 * them alike would punish anyone pulled off a range.
 *
 * On top of the measured score sits the commander's own — per fighter, and for
 * the training as a whole. The two are shown side by side rather than merged:
 * a number the range produced and a number a commander judged are not the same
 * kind of claim.
 */
export function DrillsTab({ training: t }: { training: TrainingFull }) {
  const { db, user, toast, refresh } = useApp();
  const [form, setForm] = useState<DrillForm | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Drill | null>(null);
  const [openDrill, setOpenDrill] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!db || !user) return null;

  const perms = permsFor(db, user, t);
  const canEdit = perms.canEdit;
  const canGrade = perms.isAdmin || perms.isTrainCmd || perms.canApprove;
  const roster = participants(db, t);
  const rows = scoresFor(db, t);
  const total = trainingScore(db, t);
  const mine = rows.find((r) => r.person.id === user.id);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const startNew = () => {
    setEditing(null);
    setForm(blankDrill());
  };

  const startEdit = (d: Drill) => {
    setEditing(d.id);
    setForm({
      name: d.name,
      description: d.description,
      kind: d.kind,
      rounds: d.rounds,
      weight: d.weight,
    });
  };

  return (
    <>
      {/* ── the result of the whole training ── */}
      <SectionCard title="ציון האימון">
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Figure
            label="ממוצע הצוות במקצים"
            value={total.team === null ? '—' : total.team.toFixed(1)}
            tone={scoreTone(total.team)}
            sub={`${total.scored} מתוך ${total.participants} לוחמים נמדדו`}
          />
          {!perms.seesStats && mine && (
            <Figure
              label="הציון שלי"
              value={mine.score === null ? '—' : mine.score.toFixed(1)}
              tone={scoreTone(mine.score)}
              sub={`${mine.done} מתוך ${mine.total} מקצים`}
            />
          )}
          <Figure
            label="ציון המפקד לאימון"
            value={t.grade === null ? '—' : String(t.grade)}
            tone={scoreTone(t.grade)}
            sub={t.grade_note || 'ניתן בסיום האימון'}
          />
          {total.shots > 0 && (
            <Figure
              label="ירי"
              value={`${total.hits}/${total.shots}`}
              tone="none"
              sub={`${Math.round((100 * total.hits) / total.shots)}% פגיעות`}
            />
          )}
        </div>

        {canGrade && <GradeRow training={t} run={run} busy={busy} />}
      </SectionCard>

      {/* ── the stations ── */}
      <SectionCard
        title={`מקצים (${t.drills.length})`}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            {perms.seesList && t.drills.length > 0 && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12.5 }}
                onClick={() => {
                  if (!printHTML(db.settings.app_name, drillsHTML(db, t)))
                    toast('הדפדפן חסם את חלון ההדפסה — אשר חלונות קופצים ונסה שוב');
                }}
              >
                הדפסת תוצאות
              </button>
            )}
            {canEdit && (
              <button className="btn btn-secondary" style={{ fontSize: 12.5 }} onClick={startNew}>
                הוספת מקצה
              </button>
            )}
          </div>
        }
      >
        {!t.drills.length && (
          <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)', lineHeight: 1.6 }}>
            אין עדיין מקצים. {canEdit ? 'הוסף מקצה — למשל ״ירי בעמידה״ — ורשום לכל לוחם כמה ירה וכמה פגע; הציון מחושב לבד.' : ''}
          </span>
        )}

        {form && canEdit && (
          <DrillForm
            value={form}
            onChange={setForm}
            editing={!!editing}
            busy={busy}
            onCancel={() => setForm(null)}
            onSave={() =>
              void run(async () => {
                await saveDrill(t.id, form, editing);
                setForm(null);
                setEditing(null);
              }, editing ? 'המקצה עודכן' : 'המקצה נוסף')
            }
          />
        )}

        {t.drills.map((d) => {
          const open = openDrill === d.id;
          const recorded = Object.keys(d.results).length;
          return (
            <div
              key={d.id}
              style={{
                border: '1px solid var(--color-neutral-800)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setOpenDrill(open ? null : d.id)}
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'inherit',
                    fontSize: 14,
                    textAlign: 'start',
                    flex: 1,
                    minWidth: 160,
                  }}
                >
                  {open ? '▾' : '◂'} {d.name}
                  <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
                    {' '}
                    · {DRILL_KINDS.find((k) => k.id === d.kind)?.label}
                    {d.rounds ? ` · ${d.rounds} כדורים` : ''}
                    {d.weight !== 1 ? ` · משקל ×${d.weight}` : ''}
                  </span>
                </button>
                <span className="tabnum" style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
                  {recorded}/{roster.length} נרשמו
                </span>
                {canEdit && (
                  <>
                    <button className="btn btn-ghost" onClick={() => startEdit(d)}>
                      עריכה
                    </button>
                    <button className="btn btn-ghost" onClick={() => setRemoving(d)}>
                      הסרה
                    </button>
                  </>
                )}
              </div>

              {d.description && (
                <span style={{ fontSize: 12.5, color: 'var(--color-neutral-400)', lineHeight: 1.6 }}>
                  {d.description}
                </span>
              )}

              {open && (
                <ResultsTable
                  drill={d}
                  roster={perms.seesList ? roster : roster.filter((p) => p.id === user.id)}
                  canEdit={canEdit}
                  busy={busy}
                  onSave={(personId, v) =>
                    void run(() => saveDrillResult(d, personId, user.id, v))
                  }
                  onClear={(personId) => void run(() => clearDrillResult(d.id, personId))}
                />
              )}
            </div>
          );
        })}
      </SectionCard>

      {/* ── per fighter, across every station ── */}
      {perms.seesList && t.drills.length > 0 && (
        <SectionCard title="ציון לכל לוחם">
          <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)', lineHeight: 1.6 }}>
            ציון המקצים הוא ממוצע משוקלל של המקצים שהלוחם השתתף בהם. ציון המפקד (1–10) הוא שיקול
            דעת נפרד, ונשמר גם בנוכחות של האימון.
          </span>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th>לוחם</th>
                  <th>תפקיד</th>
                  <th>מקצים</th>
                  <th>ציון מקצים</th>
                  <th>ציון מפקד (1–10)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.person.id}>
                    <td>{fullName(r.person)}</td>
                    <td style={{ color: 'var(--color-neutral-400)', fontSize: 12.5 }}>
                      {r.person.role}
                    </td>
                    <td className="tabnum">
                      {r.done}/{r.total}
                    </td>
                    <td className="tabnum" style={{ color: SCORE_COLOR[scoreTone(r.score)] }}>
                      {r.score === null ? '—' : r.score.toFixed(1)}
                    </td>
                    <td>
                      <select
                        className="input tabnum"
                        style={{ width: 'auto', minHeight: 30, padding: '2px 8px' }}
                        value={t.attendance[r.person.id]?.rating ?? ''}
                        disabled={!canGrade || busy}
                        onChange={(e) =>
                          void run(() =>
                            setAttendanceRating(
                              t.id,
                              r.person.id,
                              e.target.value === '' ? null : Number(e.target.value),
                            ),
                          )
                        }
                      >
                        <option value="">—</option>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {removing && (
        <ConfirmDialog
          open
          title={`להסיר את המקצה ״${removing.name}״?`}
          body="כל התוצאות שנרשמו במקצה הזה יימחקו יחד איתו."
          confirmLabel="הסר"
          onClose={() => setRemoving(null)}
          onConfirm={() =>
            void run(async () => {
              await removeDrill(removing.id);
              setRemoving(null);
            }, 'המקצה הוסר')
          }
        />
      )}
    </>
  );
}

// ── pieces ─────────────────────────────────────────────────────────────────

function Figure({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: ReturnType<typeof scoreTone>;
  sub: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>{label}</span>
      <span className="tabnum" style={{ fontSize: 28, lineHeight: 1.1, color: SCORE_COLOR[tone] }}>
        {value}
      </span>
      <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>{sub}</span>
    </div>
  );
}

function GradeRow({
  training: t,
  run,
  busy,
}: {
  training: TrainingFull;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  busy: boolean;
}) {
  const [grade, setGrade] = useState(t.grade === null ? '' : String(t.grade));
  const [note, setNote] = useState(t.grade_note);

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 4 }}>
      <Field label="ציון המפקד לאימון (0–100)">
        <input
          className="input tabnum"
          inputMode="numeric"
          value={grade}
          onChange={(e) => setGrade(e.target.value.replace(/\D/g, '').slice(0, 3))}
          style={{ width: 92 }}
        />
      </Field>
      <Field label="נימוק (רשות)" style={{ flex: 1, minWidth: 200 }}>
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="למשל: מקצה התנועה נקטע בגלל מזג אוויר"
        />
      </Field>
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() =>
          void run(
            () => setTrainingGrade(t.id, grade === '' ? null : Number(grade), note),
            'ציון האימון נשמר',
          )
        }
      >
        שמור ציון
      </button>
    </div>
  );
}

function DrillForm({
  value: f,
  onChange,
  editing,
  busy,
  onSave,
  onCancel,
}: {
  value: DrillForm;
  onChange: (next: DrillForm) => void;
  editing: boolean;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const kind = DRILL_KINDS.find((k) => k.id === f.kind);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-neutral-900)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <Field label="שם המקצה">
          <input
            className="input"
            value={f.name}
            onChange={(e) => onChange({ ...f, name: e.target.value })}
            placeholder="לדוגמה: ירי בעמידה"
          />
        </Field>
        <Field label="סוג מדידה">
          <select
            className="input"
            value={f.kind}
            onChange={(e) => onChange({ ...f, kind: e.target.value as DrillForm['kind'] })}
          >
            {DRILL_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        {f.kind === 'hits' && (
          <Field label="כדורים ללוחם (למילוי מראש)">
            <input
              className="input tabnum"
              inputMode="numeric"
              value={f.rounds || ''}
              onChange={(e) => onChange({ ...f, rounds: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              placeholder="20"
            />
          </Field>
        )}
        <Field label="משקל בציון (1 = רגיל)">
          <input
            className="input tabnum"
            inputMode="decimal"
            value={f.weight}
            onChange={(e) => onChange({ ...f, weight: Number(e.target.value) || 1 })}
          />
        </Field>
      </div>

      <Field label="מה היה במקצה">
        <textarea
          className="input"
          rows={2}
          value={f.description}
          onChange={(e) => onChange({ ...f, description: e.target.value })}
          placeholder="תיאור קצר: מרחק, מספר מטרות, זמן, מה נדרש מהלוחם"
        />
      </Field>

      <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>{kind?.hint}</span>

      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-primary" onClick={onSave} disabled={busy}>
          {editing ? 'שמור שינויים' : 'הוסף מקצה'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function ResultsTable({
  drill: d,
  roster,
  canEdit,
  busy,
  onSave,
  onClear,
}: {
  drill: Drill;
  roster: ReturnType<typeof participants>;
  canEdit: boolean;
  busy: boolean;
  onSave: (
    personId: string,
    v: { shots?: number | null; hits?: number | null; score?: number | null; note?: string },
  ) => void;
  onClear: (personId: string) => void;
}) {
  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v.replace(/\D/g, '')));

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ minWidth: 520 }}>
        <thead>
          <tr>
            <th>לוחם</th>
            {d.kind === 'hits' ? (
              <>
                <th>כדורים</th>
                <th>פגיעות</th>
              </>
            ) : (
              <th>{d.kind === 'passfail' ? 'עבר' : 'ציון 0–100'}</th>
            )}
            <th>ציון</th>
            <th>הערה</th>
            {canEdit && <th />}
          </tr>
        </thead>
        <tbody>
          {roster.map((p) => {
            const r = d.results[p.id];
            const score = resultScore(d, r);
            return (
              <tr key={p.id}>
                <td>{fullName(p)}</td>

                {d.kind === 'hits' ? (
                  <>
                    <td>
                      <input
                        className="input tabnum"
                        style={{ width: 76, minHeight: 30 }}
                        inputMode="numeric"
                        disabled={!canEdit || busy}
                        defaultValue={r?.shots ?? (d.rounds || '')}
                        onBlur={(e) =>
                          onSave(p.id, {
                            shots: num(e.target.value),
                            hits: r?.hits ?? null,
                            note: r?.note ?? '',
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="input tabnum"
                        style={{ width: 76, minHeight: 30 }}
                        inputMode="numeric"
                        disabled={!canEdit || busy}
                        defaultValue={r?.hits ?? ''}
                        onBlur={(e) =>
                          onSave(p.id, {
                            shots: r?.shots ?? d.rounds ?? null,
                            hits: num(e.target.value),
                            note: r?.note ?? '',
                          })
                        }
                      />
                    </td>
                  </>
                ) : d.kind === 'passfail' ? (
                  <td>
                    <input
                      type="checkbox"
                      disabled={!canEdit || busy}
                      checked={(r?.score ?? 0) >= 50}
                      onChange={(e) =>
                        onSave(p.id, { score: e.target.checked ? 100 : 0, note: r?.note ?? '' })
                      }
                    />
                  </td>
                ) : (
                  <td>
                    <input
                      className="input tabnum"
                      style={{ width: 84, minHeight: 30 }}
                      inputMode="numeric"
                      disabled={!canEdit || busy}
                      defaultValue={r?.score ?? ''}
                      onBlur={(e) => {
                        const v = num(e.target.value);
                        onSave(p.id, {
                          score: v === null ? null : Math.min(100, Math.max(0, v)),
                          note: r?.note ?? '',
                        });
                      }}
                    />
                  </td>
                )}

                <td className="tabnum" style={{ color: SCORE_COLOR[scoreTone(score)] }}>
                  {score === null ? '—' : score.toFixed(1)}
                </td>

                <td>
                  <input
                    className="input"
                    style={{ width: 150, minHeight: 30 }}
                    disabled={!canEdit || busy}
                    defaultValue={r?.note ?? ''}
                    placeholder="תקלה, פציעה…"
                    onBlur={(e) =>
                      onSave(p.id, {
                        shots: r?.shots ?? null,
                        hits: r?.hits ?? null,
                        score: r?.score ?? null,
                        note: e.target.value,
                      })
                    }
                  />
                </td>

                {canEdit && (
                  <td>
                    {r && (
                      <button className="btn btn-ghost" onClick={() => onClear(p.id)} disabled={busy}>
                        נקה
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
