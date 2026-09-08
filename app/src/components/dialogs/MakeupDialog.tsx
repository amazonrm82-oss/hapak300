'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { fmtShort } from '@/lib/core/dates';
import { fullName, participants, topicName, trainingTitle } from '@/lib/core/selectors';
import type { Person, TrainingFull } from '@/lib/core/types';
import { addGuest } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

interface Props {
  /** The training the fighter missed — set for a makeup, null for a plain attachment. */
  missed: TrainingFull | null;
  /** The training to attach someone to — set for a plain attachment. */
  into: TrainingFull | null;
  person: Person | null;
  onClose: () => void;
}

/**
 * Puts a fighter into a training that is not his team's.
 *
 * Two shapes of the same act. Coming from a fighter who missed a training, it
 * asks which training he will make it up in — the missed one then stops
 * counting against him, and he is scored where he actually trained. Coming from
 * a training, it asks whom to attach to it for the day.
 *
 * Either way it is a team commander's call and above; the database refuses
 * anyone else, so a fighter cannot arrange his own makeup.
 */
export function MakeupDialog({ missed, into, person, onClose }: Props) {
  const { db, toast, refresh } = useApp();
  const [targetId, setTargetId] = useState('');
  const [personId, setPersonId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTargetId('');
    setPersonId('');
    setNote('');
  }, [missed, into, person]);

  if (!db || (!missed && !into)) return null;

  // where he can make it up: any training still ahead that is not the one he
  // missed, and that he is not already part of
  const options = missed
    ? db.trainings
        .filter(
          (x) =>
            x.id !== missed.id &&
            x.status !== 'cancelled' &&
            x.status !== 'done' &&
            !participants(db, x).some((p) => p.id === person?.id),
        )
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  // whom to attach: anyone active who is not already on this training
  const candidates = into
    ? db.people.filter(
        (p) => p.status === 'active' && !participants(db, into).some((x) => x.id === p.id),
      )
    : [];

  async function save() {
    const pid = missed ? person?.id : personId;
    const tid = missed ? targetId : into?.id;
    if (!pid) return toast('בחר לוחם');
    if (!tid) return toast('בחר אימון');
    setBusy(true);
    try {
      await addGuest(tid, pid, missed?.id ?? null, note.trim());
      await refresh();
      toast(missed ? 'ההשלמה שובצה' : 'הלוחם שובץ לאימון');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השיבוץ נכשל');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      width={560}
      title={missed ? `השלמת אימון · ${fullName(person)}` : 'שיבוץ לוחם מצוות אחר'}
      body={
        missed
          ? `${trainingTitle(db, missed)} · ${topicName(db, missed.topic_id)} · ${fmtShort(missed.date)}. בחר את האימון שבו הוא ישלים — הציון שלו יימדד שם, והאימון שהחמיץ יפסיק להיספר לו כאפס.`
          : `${trainingTitle(db, into!)} · ${fmtShort(into!.date)}. הלוחם יופיע בכוח, בנוכחות, בציוד ובציונים של האימון הזה.`
      }
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            שיבוץ
          </button>
        </>
      }
    >
      {missed ? (
        <Field label="האימון שבו ישלים">
          <select className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">בחר אימון…</option>
            {options.map((x) => (
              <option key={x.id} value={x.id}>
                {fmtShort(x.date)} · {topicName(db, x.topic_id)} · {trainingTitle(db, x)}
              </option>
            ))}
          </select>
          {!options.length && (
            <span style={{ fontSize: 11.5, color: 'var(--color-accent-300)' }}>
              אין אימון עתידי שאפשר להשלים בו. קבע אימון חדש ואז שבץ את ההשלמה.
            </span>
          )}
        </Field>
      ) : (
        <Field label="לוחם">
          <select className="input" value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">בחר לוחם…</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {fullName(p)} · {p.team_id ? db.teams[p.team_id]?.name : 'מפקדה'}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="הערה (רשות)">
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="למשל: היה בקורס, משלים ירי עם צוות ב׳"
        />
      </Field>
    </Dialog>
  );
}
