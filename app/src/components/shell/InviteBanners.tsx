'use client';

import { useRouter } from 'next/navigation';
import { dateLine } from '@/lib/core/dates';
import { topicName, trainingTitle } from '@/lib/core/selectors';
import type { InviteRole } from '@/lib/core/types';
import { respondInvite } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

/**
 * Pending invitations to instruct or command sit at the top of every screen —
 * the unit gave them 48 hours to answer, so they should be hard to miss.
 */
export function InviteBanners() {
  const { db, user, toast, refresh } = useApp();
  const router = useRouter();
  if (!db || !user) return null;

  const invites = db.trainings
    .filter(
      (t) =>
        t.status !== 'cancelled' &&
        t.status !== 'done' &&
        ((t.instructor_id === user.id && t.inst_status === 'pending') ||
          (t.commander_id === user.id && t.cmd_status === 'pending')),
    )
    .map((t) => ({
      t,
      role: (t.instructor_id === user.id && t.inst_status === 'pending'
        ? 'instructor'
        : 'commander') as InviteRole,
    }));

  if (!invites.length) return null;

  const answer = async (tid: string, role: InviteRole, accept: boolean) => {
    try {
      await respondInvite(tid, role, accept);
      await refresh();
      toast(accept ? 'ההזמנה אושרה' : 'ההזמנה נדחתה — למפקד הוצע מחליף');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה');
    }
  };

  return (
    <div
      style={{
        maxWidth: 1400,
        margin: '14px auto 0',
        padding: '0 24px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {invites.map(({ t, role }) => (
        <div
          key={t.id}
          className="card"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            boxShadow: '0 0 0 1px var(--color-accent-700)',
            flexWrap: 'wrap',
          }}
        >
          <span className="tag tag-accent">הזמנה ממתינה</span>
          <span style={{ fontSize: 13, flex: 1, minWidth: 240 }}>
            הוזמנת ל{role === 'instructor' ? 'הדריך' : 'פקד על'} {trainingTitle(db, t)} ·{' '}
            {topicName(db, t.topic_id)} · {dateLine(t)}
          </span>
          <button className="btn btn-primary" onClick={() => void answer(t.id, role, true)}>
            אשר
          </button>
          <button className="btn btn-secondary" onClick={() => void answer(t.id, role, false)}>
            דחה
          </button>
          <button className="btn btn-ghost" onClick={() => router.push(`/trainings/${t.id}`)}>
            פרטים
          </button>
        </div>
      ))}
    </div>
  );
}
