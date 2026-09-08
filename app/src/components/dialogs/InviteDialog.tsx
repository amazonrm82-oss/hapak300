'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { suggestSubstitute } from '@/lib/core/alerts';
import { roleLabel } from '@/lib/core/permissions';
import { fullName, topicName, trainingTitle } from '@/lib/core/selectors';
import type { InviteRole, TrainingFull } from '@/lib/core/types';
import { invitePerson } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

interface Props {
  training: TrainingFull | null;
  role: InviteRole | null;
  onClose: () => void;
}

/**
 * Invites an instructor or a training commander. The system's own suggestion is
 * shown first, with the reasons that produced it.
 */
export function InviteDialog({ training, role, onClose }: Props) {
  const { db, user, toast, refresh } = useApp();
  const [pid, setPid] = useState('');
  const [busy, setBusy] = useState(false);

  const suggestion = useMemo(
    () => (db && training && role ? suggestSubstitute(db, training, role) : null),
    [db, training, role],
  );

  useEffect(() => {
    setPid(suggestion?.p.id ?? '');
  }, [suggestion]);

  if (!db || !training || !role) return null;

  const people = db.people.filter((p) => p.status === 'active');
  // the same two lists as the training form: instructing takes the flag,
  // commanding a training takes a team commander and above
  const candidates =
    role === 'instructor'
      ? people.filter((p) => p.is_instructor)
      : people.filter(
          (p) => p.is_team_commander || p.role === 'קמב״צ' || p.is_hapak_commander || p.is_admin,
        );

  async function send() {
    if (!pid) return toast('בחר מוזמן');
    setBusy(true);
    try {
      await invitePerson(training!.id, role!, pid);
      await refresh();
      toast(
        pid === user?.id
          ? 'שובצת לאימון'
          : `ההזמנה נשלחה — ממתין לאישור תוך ${db!.settings.invite_hours} שעות`,
      );
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'שליחת ההזמנה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      width={560}
      title={`הזמנת ${role === 'instructor' ? 'מדריך' : 'מפקד אימון'}`}
      body={`${trainingTitle(db, training)} · ${topicName(db, training.topic_id)}`}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button className="btn btn-primary" onClick={() => void send()} disabled={busy}>
            שלח הזמנה
          </button>
        </>
      }
    >
      {suggestion && (
        <div
          className="card"
          style={{ padding: '10px 12px', gap: 2, boxShadow: '0 0 0 1px var(--color-accent-700)' }}
        >
          <span style={{ fontSize: 11, color: 'var(--color-accent)' }}>הצעת המערכת למחליף</span>
          <span style={{ fontSize: 14 }}>{fullName(suggestion.p)}</span>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
            {suggestion.why.join(' · ')}
          </span>
        </div>
      )}

      <Field label="מוזמן">
        <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>
          <option value="">בחר…</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {fullName(p)} · {roleLabel(db, p)}
              {role === 'instructor' && p.qual.includes(training.topic_id) ? ' · מוסמך' : ''}
            </option>
          ))}
        </select>
      </Field>

      <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
        ההזמנה נשלחת בתוך האפליקציה. אם אין מענה תוך {db.settings.invite_hours} שעות או שההזמנה נדחית — המערכת מציעה מחליף.
      </span>
    </Dialog>
  );
}
