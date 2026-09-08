'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { ATT_STATUSES } from '@/lib/core/constants';
import { fmtShort } from '@/lib/core/dates';
import { fullName, personById, topicName, trainingTitle } from '@/lib/core/selectors';
import type { AttStatus, TrainingFull } from '@/lib/core/types';
import { markAttendance } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

interface Props {
  training: TrainingFull | null;
  personId: string | null;
  onClose: () => void;
  /** On a phone the picker rises from the bottom, as in the app prototype. */
  sheet?: boolean;
}

export function AttendanceDialog({ training, personId, onClose, sheet }: Props) {
  const { db, user, toast, refresh } = useApp();
  const [status, setStatus] = useState<AttStatus | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const target = personId ?? user?.id ?? null;

  useEffect(() => {
    if (!training || !target) return;
    const a = training.attendance[target];
    setStatus(a?.status ?? '');
    setReason(a?.reason ?? '');
  }, [training, target]);

  if (!db || !training || !target) return null;

  const needsReason = !!status && status !== 'coming' && status !== 'late';

  /**
   * Saves and closes.
   *
   * Picking ״מגיע״ is the whole answer, so the tap that picks it is the tap that
   * ends the dialog — asking someone to choose and then confirm the choice they
   * just made is a second tap that adds nothing. Only the statuses that need a
   * reason keep the two steps, because the reason is still to be typed.
   */
  async function save(pick: AttStatus | '' = status, why = reason) {
    if (!pick) return toast('בחר סטטוס נוכחות');
    setBusy(true);
    try {
      await markAttendance(training!.id, target!, pick, why);
      await refresh();
      toast(target === user?.id ? 'הנוכחות שלך נשמרה' : 'הנוכחות עודכנה');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'שמירת הנוכחות נכשלה');
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
      title="סימון נוכחות"
      body={`${trainingTitle(db, training)} · ${topicName(db, training.topic_id)} · ${fmtShort(training.date)}`}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          {needsReason && (
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
              שמירה
            </button>
          )}
        </>
      }
    >
      <span style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>
        לוחם: {fullName(personById(db, target))}
      </span>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: sheet ? '1fr 1fr' : 'repeat(3, minmax(0,1fr))',
          gap: 8,
        }}
      >
        {ATT_STATUSES.map((s) => (
          <button
            key={s.id}
            className={`btn ${status === s.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setStatus(s.id);
              // coming and late need nothing else, so this tap is the answer
              if (s.id === 'coming' || s.id === 'late') void save(s.id, '');
            }}
            style={{ minHeight: 46 }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {needsReason && (
        <Field label="סיבה (חובה)">
          <textarea
            className="input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="לדוגמה: מילואים בגדוד אחר, אישור רפואי"
          />
        </Field>
      )}

      <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
        {target === user?.id
          ? 'התשובה נרשמת מיד ואינה ניתנת לשינוי — שינוי הוא עדכון של מפקד הצוות. מי שלא סימן נחשב ״לא מגיע״.'
          : 'מי שלא סימן נחשב ״לא מגיע״. מפקד הצוות מאשר את הנוכחות הסופית.'}
      </span>
    </Dialog>
  );
}
