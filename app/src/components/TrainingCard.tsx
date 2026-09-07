'use client';

import { useRouter } from 'next/navigation';
import { STATUS_LABEL, TRAINING_STATUS } from '@/lib/core/constants';
import { trainingAlerts } from '@/lib/core/alerts';
import { dateLine, pad, relDays, weekOf } from '@/lib/core/dates';
import { permsFor } from '@/lib/core/permissions';
import {
  attendanceStats,
  fullName,
  participants,
  personById,
  topicName,
  trainingTitle,
} from '@/lib/core/selectors';
import type { Db, Person, TrainingFull } from '@/lib/core/types';
import { ProgressBar, Tag } from '@/components/ui/bits';
import { orderText } from '@/lib/core/exports';

export function statusWord(s: 'pending' | 'accepted' | 'declined'): string {
  return s === 'accepted' ? 'אישר' : s === 'declined' ? 'דחה' : 'ממתין לאישור';
}

export interface CardData {
  kicker: string;
  title: string;
  statusLabel: string;
  statusKind: 'accent' | 'neutral' | 'outline';
  dateLine: string;
  tags: string[];
  attLabel: string;
  attPct: number;
  mineLabel: string;
  isPart: boolean;
  canMark: boolean;
  markLabel: string;
  alerts: string[];
  unreadChat: number;
}

/** The shared summary of a training, used on the schedule and the phone home screen. */
export function cardData(
  db: Db,
  user: Person,
  today: string,
  now: string,
  t: TrainingFull,
): CardData {
  const st = attendanceStats(db, t);
  const perms = permsFor(db, user, t);
  const mine = t.attendance[user.id];
  const isPart = participants(db, t).some((p) => p.id === user.id);

  const veh: Record<string, number> = {};
  t.vehicles.forEach((v) => {
    veh[v.type] = (veh[v.type] || 0) + 1;
  });
  const ammoTotal = t.ammo.reduce((s, a) => s + a.allocated, 0);

  return {
    kicker: `שבוע ${pad(weekOf(db.settings.period_start, t.date))} · ${trainingTitle(db, t)}`,
    title: topicName(db, t.topic_id),
    statusLabel: TRAINING_STATUS[t.status],
    statusKind:
      t.status === 'cancelled' ? 'outline' : t.team_id === 'joint' || t.status === 'done' ? 'accent' : 'neutral',
    dateLine: `${dateLine(t)} · ${relDays(today, t.date)}`,
    tags: [
      ...Object.entries(veh).map(([k, n]) => `${k} ×${n}`),
      ...(ammoTotal ? [`${ammoTotal.toLocaleString('en-US')} כד׳`] : []),
      ...t.food.slice(0, 2).map((f) => `${f.name} ${f.qty} ${f.unit}`),
    ],
    attLabel: `${st.responded}/${st.total} סימנו · ${st.expected} מגיעים`,
    attPct: st.pct,
    mineLabel: mine
      ? `הסטטוס שלי: ${STATUS_LABEL[mine.status]}${mine.approved ? ' · אושר' : ''}`
      : isPart
        ? 'טרם סימנת נוכחות'
        : '',
    isPart,
    canMark: isPart && t.status !== 'done' && t.status !== 'cancelled' && today <= t.date,
    markLabel: mine ? 'עדכון נוכחות' : 'סימון נוכחות',
    alerts: perms.seesStats ? trainingAlerts(db, t, today, now) : [],
    unreadChat: t.chat.filter((m) => !m.read_by.includes(user.id)).length,
  };
}

interface Props {
  db: Db;
  user: Person;
  today: string;
  now: string;
  training: TrainingFull;
  span?: number;
  onMark: () => void;
  onShareOrder: (text: string) => void;
}

export function TrainingCard({ db, user, today, now, training: t, span = 1, onMark, onShareOrder }: Props) {
  const router = useRouter();
  const c = cardData(db, user, today, now, t);

  return (
    <article className="card elev-md" style={{ padding: 16, gap: 10, gridColumn: `span ${span}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11.5, color: 'var(--color-accent)' }}>{c.kicker}</span>
        <Tag kind={c.statusKind}>{c.statusLabel}</Tag>
      </div>

      <div className="card-title" style={{ fontSize: 20 }}>
        {c.title}
      </div>
      <div className="tabnum" style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>
        {c.dateLine}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '5px 12px',
          fontSize: 12.5,
        }}
      >
        <span style={{ color: 'var(--color-neutral-500)' }}>מיקום</span>
        <span>
          {t.location || '—'}
          {t.coords ? (
            <>
              {' · נצ״ד '}
              <span className="tabnum">{t.coords}</span>
            </>
          ) : null}
        </span>
        <span style={{ color: 'var(--color-neutral-500)' }}>מדריך</span>
        <span>
          {fullName(personById(db, t.instructor_id))}{' '}
          <span style={{ color: 'var(--color-neutral-500)' }}>· {statusWord(t.inst_status)}</span>
        </span>
        <span style={{ color: 'var(--color-neutral-500)' }}>מפקד אימון</span>
        <span>
          {fullName(personById(db, t.commander_id))}{' '}
          <span style={{ color: 'var(--color-neutral-500)' }}>· {statusWord(t.cmd_status)}</span>
        </span>
        <span style={{ color: 'var(--color-neutral-500)' }}>יציאה</span>
        <span className="tabnum">
          {t.departure} · {t.pickup}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {c.tags.map((tg, i) => (
          <Tag key={i}>{tg}</Tag>
        ))}
      </div>

      <ProgressBar pct={c.attPct} label={c.attLabel} />

      {c.alerts.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-neutral-900)',
          }}
        >
          {c.alerts.map((a, i) => (
            <span key={i} style={{ fontSize: 12, color: 'var(--color-accent-300)' }}>
              • {a}
            </span>
          ))}
        </div>
      )}

      {c.mineLabel && (
        <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{c.mineLabel}</span>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {c.canMark && (
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onMark}>
            {c.markLabel}
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => router.push(`/trainings/${t.id}`)}>
          פרטי האימון
        </button>
        <button className="btn btn-ghost" onClick={() => router.push(`/trainings/${t.id}?tab=chat`)}>
          {c.unreadChat ? `צ׳אט (${c.unreadChat})` : 'צ׳אט'}
        </button>
        <button className="btn btn-ghost" onClick={() => onShareOrder(orderText(db, t))}>
          שיתוף פקודה
        </button>
      </div>
    </article>
  );
}
