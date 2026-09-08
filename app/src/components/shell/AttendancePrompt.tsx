'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { fmtFull } from '@/lib/core/dates';
import { isRostered, topicName, trainingTitle } from '@/lib/core/selectors';
import type { TrainingFull } from '@/lib/core/types';
import { markAttendance } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

const SEEN_KEY = 'hapak-attendance-asked';

/**
 * Asks, on the way in, about the next training nobody has heard back on.
 *
 * A training reaches the team as a push, and a push is easy to swipe away. The
 * commander still needs a number by the night before, and chasing people for it
 * is the job this replaces: whoever has not answered is asked the moment they
 * open the app, with the training in front of them.
 *
 * It asks once per training per session — closing it is allowed, and the
 * question comes back next time rather than blocking the app. A reason is
 * required for anything other than coming, exactly as on the attendance tab, so
 * the commander is never left with an unexplained gap.
 */
export function AttendancePrompt() {
  const { db, user, today, toast, refresh } = useApp();
  const [asking, setAsking] = useState<TrainingFull | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!db || !user) return;

    const pending = db.trainings
      .filter(
        (t) =>
          t.status !== 'cancelled' &&
          t.status !== 'done' &&
          t.date >= today &&
          !t.attendance[user.id] &&
          (isRostered(db, user, t.team_id) || t.guests?.some((g) => g.person_id === user.id)),
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    const next = pending.find((t) => !seen().includes(t.id));
    setAsking(next ?? null);
    setReason('');
  }, [db, user, today]);

  if (!db || !user || !asking) return null;

  const answer = async (status: 'coming' | 'late' | 'absent') => {
    if (status === 'absent' && !reason.trim()) {
      toast('חובה לציין סיבה כשלא מגיעים');
      return;
    }
    setBusy(true);
    try {
      await markAttendance(asking.id, user.id, status, reason);
      remember(asking.id);
      await refresh();
      toast(status === 'absent' ? 'נרשם שאינך מגיע' : 'תודה — נרשמת');
      setAsking(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הסימון נכשל');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    remember(asking.id);
    setAsking(null);
  };

  return (
    <Dialog
      open
      onClose={close}
      width={520}
      title="נקבע לך אימון — מגיע?"
      body={`${trainingTitle(db, asking)} · ${topicName(db, asking.topic_id)}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5 }}>
        <span>{fmtFull(asking.date)}</span>
        <span style={{ color: 'var(--color-neutral-400)' }}>
          {asking.start}–{asking.end} · {asking.location || 'מיקום טרם נקבע'}
        </span>
        <span style={{ color: 'var(--color-neutral-400)' }}>
          יציאה {asking.departure} מ{asking.pickup}
        </span>
      </div>

      <Field label="סיבה (חובה אם אינך מגיע)">
        <input
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="למשל: מילואים אחר, גימלים, קורס"
        />
      </Field>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => void answer('coming')}>
          מגיע
        </button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void answer('late')}>
          מאחר
        </button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void answer('absent')}>
          לא מגיע
        </button>
      </div>

      <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
        אפשר לשנות את התשובה עד תחילת האימון, במסך הנוכחות של האימון.
      </span>
    </Dialog>
  );
}

/** Trainings already asked about in this session — closing counts as asked. */
function seen(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function remember(id: string): void {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen(), id]));
  } catch {
    /* a browser with storage blocked simply gets asked again */
  }
}
