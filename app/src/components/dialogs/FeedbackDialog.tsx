'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { fmtShort } from '@/lib/core/dates';
import { topicName, trainingTitle } from '@/lib/core/selectors';
import type { TrainingFull } from '@/lib/core/types';
import { saveFeedback } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

const ROWS: [keyof State, string][] = [
  ['overall', 'דירוג כללי'],
  ['instructor', 'המדריך'],
  ['logistics', 'לוגיסטיקה'],
];

interface State {
  overall: number;
  instructor: number;
  logistics: number;
  comment: string;
}

/** Opens once the training is done; visible to commanders and the instructor. */
export function FeedbackDialog({
  training,
  onClose,
  sheet,
}: {
  training: TrainingFull | null;
  onClose: () => void;
  sheet?: boolean;
}) {
  const { db, user, toast, refresh } = useApp();
  const [s, setS] = useState<State>({ overall: 0, instructor: 0, logistics: 0, comment: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!training || !user) return;
    const fb = training.feedback[user.id];
    setS({
      overall: fb?.overall ?? 0,
      instructor: fb?.instructor ?? 0,
      logistics: fb?.logistics ?? 0,
      comment: fb?.comment ?? '',
    });
  }, [training, user]);

  if (!db || !training || !user) return null;

  async function send() {
    setBusy(true);
    try {
      await saveFeedback(training!.id, user!.id, s);
      await refresh();
      toast('תודה — המשוב נשמר');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'שמירת המשוב נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      sheet={sheet}
      width={560}
      title="משוב על האימון"
      body={`${trainingTitle(db, training)} · ${topicName(db, training.topic_id)} · ${fmtShort(training.date)} · המשוב נראה למפקדים ולמדריך`}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button className="btn btn-primary" onClick={() => void send()} disabled={busy}>
            שליחת משוב
          </button>
        </>
      }
    >
      {ROWS.map(([key, label]) => (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>{label}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`btn ${s[key] === n ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setS((v) => ({ ...v, [key]: n }))}
                style={{ minHeight: 42 }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}

      <Field label="הערה חופשית (רשות)">
        <textarea
          className="input"
          rows={2}
          value={s.comment}
          onChange={(e) => setS((v) => ({ ...v, comment: e.target.value }))}
          placeholder="מה היה טוב, מה לשפר"
        />
      </Field>
    </Dialog>
  );
}
