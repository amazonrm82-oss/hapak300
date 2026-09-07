'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Tag } from '@/components/ui/bits';
import { TRAINING_STATUS } from '@/lib/core/constants';
import { fmtFull, fmtShort } from '@/lib/core/dates';
import {
  activeTrainings,
  attendanceStats,
  fullName,
  participants,
  personById,
  topicName,
  trainingTitle,
} from '@/lib/core/selectors';
import type { TrainingTeam } from '@/lib/core/types';
import { useApp } from '@/lib/data/provider';

/** Finished and cancelled trainings, filtered by team, topic and free text. */
export default function ArchivePage() {
  const { db, user } = useApp();
  const router = useRouter();
  const [team, setTeam] = useState<'all' | TrainingTeam>('all');
  const [topic, setTopic] = useState('all');
  const [q, setQ] = useState('');

  if (!db || !user) return null;

  const all = db.trainings
    .filter((t) => t.status === 'done' || t.status === 'cancelled')
    .sort((a, b) => b.date.localeCompare(a.date));

  const query = q.trim();
  const rows = all.filter(
    (t) =>
      (team === 'all' || t.team_id === team) &&
      (topic === 'all' || t.topic_id === topic) &&
      (!query ||
        [
          topicName(db, t.topic_id),
          t.location,
          fullName(personById(db, t.instructor_id)),
          fullName(personById(db, t.commander_id)),
          t.summary.commander,
          t.summary.keep,
          t.summary.improve,
          ...participants(db, t).map((p) => p.name),
        ]
          .join(' ')
          .includes(query)),
  );

  const first = activeTrainings(db)[0];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 26, margin: '0 0 4px' }}>ארכיון</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-500)' }}>
            אימונים שהסתיימו או בוטלו · {rows.length} רשומות
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            className="input"
            style={{ width: 'auto' }}
            value={team}
            onChange={(e) => setTeam(e.target.value as typeof team)}
          >
            <option value="all">כל הצוותים</option>
            <option value="a">{db.teams.a.name}</option>
            <option value="b">{db.teams.b.name}</option>
            <option value="joint">משותף</option>
          </select>
          <select
            className="input"
            style={{ width: 'auto' }}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="all">כל הנושאים</option>
            {db.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ width: 240 }}
            placeholder="חיפוש: מדריך, לוחם, מיקום, לקח…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {!rows.length && (
        <div
          style={{
            border: '1px dashed var(--color-neutral-800)',
            borderRadius: 'var(--radius-md)',
            padding: 28,
            textAlign: 'center',
            color: 'var(--color-neutral-500)',
            fontSize: 13.5,
          }}
        >
          {all.length === 0
            ? `הארכיון ריק — יתמלא כשיסתיים האימון הראשון${
                first ? ` (${topicName(db, first.topic_id)}, ${fmtShort(first.date)})` : ''
              }.`
            : 'אין רשומות שמתאימות לסינון.'}
        </div>
      )}

      <div className="hapak-archive">
        {rows.map((t) => {
          const st = attendanceStats(db, t);
          const ammoUsed = t.ammo.reduce((s, a) => s + (a.used || 0), 0);
          return (
            <article key={t.id} className="card elev-sm" style={{ padding: '14px 16px', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11.5, color: 'var(--color-accent)' }}>
                  {trainingTitle(db, t)} · {fmtFull(t.date)}
                </span>
                <Tag kind={t.status === 'done' ? 'accent' : 'outline'}>{TRAINING_STATUS[t.status]}</Tag>
              </div>
              <span className="card-title" style={{ fontSize: 17 }}>
                {topicName(db, t.topic_id)}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>
                {t.status === 'done'
                  ? `${st.coming}/${st.total} נכחו · ${st.approved} מאושרים`
                  : t.cancel_reason}{' '}
                · מדריך {fullName(personById(db, t.instructor_id))} · {ammoUsed} כד׳ נוצלו
                {t.photos.length ? ` · ${t.photos.length} תמונות` : ''}
              </span>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-300)' }}>
                {t.summary.commander ? t.summary.commander.slice(0, 160) : 'ללא סיכום'}
              </p>
              <button
                className="btn btn-secondary"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => router.push(`/trainings/${t.id}?tab=summary`)}
              >
                פתח סיכום
              </button>
            </article>
          );
        })}
      </div>

      <style jsx>{`
        .hapak-archive {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        @media (max-width: 900px) {
          .hapak-archive {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </>
  );
}
