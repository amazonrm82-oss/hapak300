'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Tag } from '@/components/ui/bits';
import { trainingAlerts } from '@/lib/core/alerts';
import { TRAINING_STATUS } from '@/lib/core/constants';
import { dayLetter, fmtShort, pad, weekOf } from '@/lib/core/dates';
import { permsFor } from '@/lib/core/permissions';
import {
  attendanceStats,
  fullName,
  isPendingSummary,
  personById,
  topicName,
  trainingTitle,
} from '@/lib/core/selectors';
import type { TrainingTeam } from '@/lib/core/types';
import { useApp } from '@/lib/data/provider';

/** All live trainings in a table, with the commanders' "waiting to be summarised" list on top. */
export default function TrainingsPage() {
  const { db, user, perms, today, now } = useApp();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | TrainingTeam>('all');

  if (!db || !user) return null;

  const rows = db.trainings
    .filter(
      (t) =>
        t.status !== 'cancelled' && t.status !== 'done' && (filter === 'all' || t.team_id === filter),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const pending = db.trainings
    .filter(
      (t) =>
        isPendingSummary(t, today) &&
        (perms.isAdmin ||
          t.commander_id === user.id ||
          (user.is_team_commander && (t.team_id === user.team_id || t.team_id === 'joint'))),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const segs: [typeof filter, string][] = [
    ['all', 'הכול'],
    ['a', db.teams.a.name],
    ['b', db.teams.b.name],
    ['joint', 'משותף'],
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 26, margin: '0 0 4px' }}>אימונים</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-500)' }}>
            {rows.length} אימונים · אימונים שהסתיימו או בוטלו נמצאים בארכיון
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {segs.map(([id, label]) => (
            <button
              key={id}
              className={`btn ${filter === id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {pending.length > 0 && (
        <section
          className="card"
          style={{ padding: '12px 16px', gap: 8, boxShadow: '0 0 0 1px var(--color-accent-700)' }}
        >
          <span className="card-title" style={{ fontSize: 14 }}>
            ממתינים לסיכום ואישור נוכחות סופי
          </span>
          {pending.map((t) => {
            const st = attendanceStats(db, t);
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }}>
                  {trainingTitle(db, t)} · {topicName(db, t.topic_id)} · {fmtShort(t.date)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  {st.approved}/{st.total} מאושרים ·{' '}
                  {t.trainer_summarized ? 'סוכם על ידי מפקד האימון' : 'טרם סוכם'}
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ marginInlineStart: 'auto', fontSize: 12, whiteSpace: 'nowrap' }}
                  onClick={() => router.push(`/trainings/${t.id}?tab=attendance`)}
                >
                  לסיכום
                </button>
              </div>
            );
          })}
        </section>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>שבוע</th>
              <th>אימון</th>
              <th>נושא</th>
              <th>מועד</th>
              <th>מיקום</th>
              <th>מדריך</th>
              <th>מפקד אימון</th>
              <th>נוכחות</th>
              <th>סטטוס</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const st = attendanceStats(db, t);
              const p = permsFor(db, user, t);
              const alerts = p.seesStats ? trainingAlerts(db, t, today, now).length : 0;
              return (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/trainings/${t.id}`)}>
                  <td className="tabnum" style={{ color: 'var(--color-neutral-400)' }}>
                    {pad(weekOf(db.settings.period_start, t.date))}
                  </td>
                  <td>{trainingTitle(db, t)}</td>
                  <td>{topicName(db, t.topic_id)}</td>
                  <td className="tabnum">
                    {dayLetter(t.date)} {fmtShort(t.date)} · {t.start}–{t.end}
                  </td>
                  <td style={{ color: 'var(--color-neutral-400)' }}>{t.location}</td>
                  <td>{fullName(personById(db, t.instructor_id))}</td>
                  <td>{fullName(personById(db, t.commander_id))}</td>
                  <td className="tabnum">
                    {st.responded}/{st.total}
                    {alerts > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--color-accent-300)' }}> · {alerts} התרעות</span>
                    )}
                  </td>
                  <td>
                    <Tag kind={t.team_id === 'joint' ? 'accent' : 'neutral'}>{TRAINING_STATUS[t.status]}</Tag>
                  </td>
                  <td>
                    <button className="btn btn-ghost">פתח</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!rows.length && (
        <span style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>אין אימונים בסינון זה</span>
      )}
    </>
  );
}
