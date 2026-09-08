'use client';

import { useState } from 'react';
import { Avatar, Tag } from '@/components/ui/bits';
import { trainingAlerts } from '@/lib/core/alerts';
import { MakeupDialog } from '@/components/dialogs/MakeupDialog';
import { STATUS_LABEL } from '@/lib/core/constants';
import { fmtShort } from '@/lib/core/dates';
import { permsFor, canMarkAttendance } from '@/lib/core/permissions';
import {
  attendanceStats,
  fullName,
  participants,
  personById,
} from '@/lib/core/selectors';
import type { Person, TrainingFull } from '@/lib/core/types';
import {
  approveAttendance,
  reopenAttendance,
  setAttendanceRating,
  summarizeAttendance,
} from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

/**
 * Two-stage approval, as the unit decided: the training commander closes the
 * tally, then the team commander gives the final approval. Anyone who never
 * responded is recorded as absent at that point.
 */
export function AttendanceTab({
  training: t,
  onEditPerson,
}: {
  training: TrainingFull;
  onEditPerson: (personId: string) => void;
}) {
  const { db, user, today, now, toast, refresh } = useApp();
  // whom this fighter is being sent to make the training up in, or whom to
  // attach to this training — both go through the same dialog
  const [makeupFor, setMakeupFor] = useState<Person | null>(null);
  const [attaching, setAttaching] = useState(false);
  if (!db || !user) return null;

  const perms = permsFor(db, user, t);
  const st = attendanceStats(db, t);
  const ps = participants(db, t);
  const rows = perms.seesList ? ps : ps.filter((p) => p.id === user.id);
  const attOpen = today <= t.date && t.status !== 'done' && t.status !== 'cancelled';
  const alerts = perms.seesStats ? trainingAlerts(db, t, today, now) : [];
  const min = t.team_id === 'joint' ? db.settings.min_attendance * 2 : db.settings.min_attendance;
  const lastApproval = t.approval_log[t.approval_log.length - 1];
  const guestIds = new Set((t.guests ?? []).map((g) => g.person_id));
  // the training a fighter was sent to, to make this one up
  const makeupIn = (pid: string) =>
    db.trainings.find((x) => x.guests?.some((g) => g.person_id === pid && g.makeup_for === t.id)) ??
    null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await refresh();
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה');
    }
  };

  return (
    <>
      <div
        className="card"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: '10px 16px', flexWrap: 'wrap' }}
      >
        <span style={{ fontSize: 13 }}>
          {t.approved_all
            ? 'הנוכחות הסופית אושרה'
            : t.trainer_summarized
              ? 'מפקד האימון סיכם — ממתין לאישור מפקד הצוות'
              : 'הנוכחות פתוחה לסימון עד תחילת האימון'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
          {st.coming} מגיעים · {st.late} מאחרים · {st.absent} לא מגיעים · {st.unresponded} לא הגיבו · סימון עד{' '}
          {fmtShort(t.date)} {t.start}
        </span>
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {perms.canGuest && t.status !== 'cancelled' && (
            <button className="btn btn-secondary" onClick={() => setAttaching(true)}>
              שיבוץ מצוות אחר
            </button>
          )}
          {perms.canSummarize && !t.trainer_summarized && t.status !== 'cancelled' && (
            <button
              className="btn btn-secondary"
              onClick={() => void run(() => summarizeAttendance(t.id), 'סיכום הנוכחות נשלח למפקד הצוות')}
            >
              סיכום נוכחות (מפקד אימון)
            </button>
          )}
          {perms.canApprove && !t.approved_all && t.status !== 'cancelled' && (
            <button
              className="btn btn-primary"
              style={{ whiteSpace: 'nowrap' }}
              onClick={() =>
                void run(() => approveAttendance(t.id), 'הנוכחות הסופית אושרה לכל המשתתפים')
              }
            >
              אישור סופי לכל הצוות
            </button>
          )}
          {perms.canApprove && t.approved_all && (
            <button
              className="btn btn-secondary"
              onClick={() => void run(() => reopenAttendance(t.id), 'הנוכחות נפתחה מחדש לעריכה')}
            >
              פתיחה מחדש
            </button>
          )}
        </div>
      </div>

      {alerts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', padding: '0 4px' }}>
          {alerts.map((a, i) => (
            <span key={i} style={{ fontSize: 12.5, color: 'var(--color-accent-300)' }}>
              • {a}
            </span>
          ))}
        </div>
      )}

      <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
        סף מינימום {min} לוחמים · תפקידים חיוניים: {db.settings.essential_roles.join(', ')}
        {lastApproval
          ? ` · אושר לאחרונה: ${fullName(personById(db, lastApproval.by))} · ${lastApproval.at}`
          : ''}
      </span>

      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th>לוחם</th>
              <th>תפקיד</th>
              {perms.seesPN && <th>מ.א.</th>}
              <th>סטטוס</th>
              <th>סיבה</th>
              <th>שעת סימון</th>
              <th>דירוג</th>
              <th>אישור</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const a = t.attendance[p.id];
              const isMe = p.id === user.id;
              const canEdit = canMarkAttendance(db, user, t, p.id, today);
              return (
                <tr key={p.id}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={p.name} size={26} />
                      {fullName(p)}
                      {isMe && (
                        <Tag kind="outline" style={{ fontSize: 10 }}>
                          אני
                        </Tag>
                      )}
                      {guestIds.has(p.id) && (
                        <Tag kind="accent" style={{ fontSize: 10 }}>
                          {t.guests.find((g) => g.person_id === p.id)?.makeup_for ? 'השלמה' : 'מצוות אחר'}
                        </Tag>
                      )}
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-neutral-400)' }}>{p.role}</td>
                  {perms.seesPN && (
                    <td className="tabnum" style={{ color: 'var(--color-neutral-400)' }}>
                      {p.pn}
                    </td>
                  )}
                  <td>
                    <Tag kind={!a ? 'outline' : a.status === 'coming' ? 'accent' : 'neutral'}>
                      {a ? STATUS_LABEL[a.status] : 'לא הגיב'}
                    </Tag>
                  </td>
                  <td style={{ color: 'var(--color-neutral-400)', fontSize: 12.5 }}>{a?.reason ?? ''}</td>
                  <td className="tabnum" style={{ color: 'var(--color-neutral-400)', fontSize: 12 }}>
                    {a?.marked_at ?? ''}
                  </td>
                  <td>
                    {(perms.canApprove || perms.isTrainCmd) && (
                      <select
                        className="input"
                        style={{ width: 'auto', minHeight: 28, padding: '1px 6px', fontSize: 12.5 }}
                        value={a?.rating ? String(a.rating) : ''}
                        onChange={(e) =>
                          void run(
                            () => setAttendanceRating(t.id, p.id, Number(e.target.value) || null),
                            'הדירוג נשמר',
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
                    )}
                  </td>
                  <td>
                    {a?.approved && (
                      <span style={{ fontSize: 12, color: 'var(--color-accent-300)' }}>
                        אושר · {fullName(personById(db, a.approved_by))}
                      </span>
                    )}
                    {perms.canApprove && !a?.approved && t.status !== 'cancelled' && (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12 }}
                        onClick={() => void run(() => approveAttendance(t.id, p.id), 'הנוכחות אושרה')}
                      >
                        אשר
                      </button>
                    )}
                    {perms.canApprove && a?.approved && (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12 }}
                        onClick={() => void run(() => reopenAttendance(t.id, p.id), 'הנוכחות נפתחה מחדש')}
                      >
                        פתח
                      </button>
                    )}
                  </td>
                  <td>
                    {canEdit && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '3px 8px' }}
                        onClick={() => onEditPerson(p.id)}
                      >
                        עדכון
                      </button>
                    )}
                    {/* whoever was not there can be sent to make it up, and
                        until he is, the training scores him zero once closed */}
                    {perms.canGuest &&
                      !guestIds.has(p.id) &&
                      a?.status !== 'coming' &&
                      a?.status !== 'late' &&
                      t.status !== 'cancelled' &&
                      (makeupIn(p.id) ? (
                        <span style={{ fontSize: 11.5, color: 'var(--color-accent-300)' }}>
                          {' '}
                          משלים ב-{fmtShort(makeupIn(p.id)!.date)}
                        </span>
                      ) : (
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '3px 8px' }}
                          onClick={() => setMakeupFor(p)}
                        >
                          השלמה
                        </button>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <MakeupDialog
        missed={makeupFor ? t : null}
        into={attaching ? t : null}
        person={makeupFor}
        onClose={() => {
          setMakeupFor(null);
          setAttaching(false);
        }}
      />

      {!perms.seesList && (
        <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
          לוחם רואה את הנוכחות של עצמו בלבד. רשימת הצוות המלאה גלויה למפקדים ולמדריך האימון.
        </span>
      )}
    </>
  );
}
