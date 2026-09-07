'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { DEFAULT_FREQ, DEFAULT_PICKUP } from '@/lib/core/constants';
import { addDays, weekStart } from '@/lib/core/dates';
import { roleLabel } from '@/lib/core/permissions';
import { fullName, topicName, topicSafety } from '@/lib/core/selectors';
import type { TrainingFull, TrainingTeam } from '@/lib/core/types';
import { createTraining, updateTraining, type TrainingForm } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

interface Props {
  open: boolean;
  training: TrainingFull | null; // null = new
  week?: number;
  onClose: () => void;
}

const blank = (topicId: string, safety: string, date: string): TrainingForm => ({
  topic_id: topicId,
  new_topic: '',
  team_id: 'a',
  date,
  start: '',
  end: '',
  location: '',
  coords: '',
  commander_id: '',
  instructor_id: '',
  freq: DEFAULT_FREQ,
  pickup: DEFAULT_PICKUP,
  safety,
  notes: '',
});

/** Every field the unit made mandatory before a training may be published. */
export function TrainingFormDialog({ open, training, week = 1, onClose }: Props) {
  const { db, user, toast, refresh } = useApp();
  const router = useRouter();
  const [f, setF] = useState<TrainingForm | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !db) return;
    if (training) {
      setF({
        topic_id: training.topic_id,
        new_topic: '',
        team_id: training.team_id,
        date: training.date,
        start: training.start,
        end: training.end,
        location: training.location,
        coords: training.coords,
        commander_id: training.commander_id ?? '',
        instructor_id: training.instructor_id ?? '',
        freq: training.freq,
        pickup: training.pickup,
        safety: training.safety,
        notes: training.notes,
      });
    } else {
      const firstTopic = db.topics[0]?.id ?? 'setup';
      setF(
        blank(
          firstTopic,
          topicSafety(db, firstTopic),
          addDays(weekStart(db.settings.period_start, week), 2),
        ),
      );
    }
  }, [open, training, db, week]);

  if (!open || !db || !user || !f) return null;

  const set =
    <K extends keyof TrainingForm>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF((s) => (s ? { ...s, [k]: e.target.value } : s));

  // switching topic pulls in that topic's safety template
  const onTopic = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setF((s) =>
      s ? { ...s, topic_id: id, safety: id === '__new' ? s.safety : topicSafety(db, id) || s.safety } : s,
    );
  };

  const people = db.people.filter((p) => p.status === 'active');
  const instructorOpts = [
    ...people.filter((p) => p.is_instructor),
    ...people.filter((p) => !p.is_instructor && p.team_id),
  ];
  const commanderOpts = people.filter(
    (p) => p.is_team_commander || p.role === 'קמב״צ' || p.is_hapak_commander || p.is_admin,
  );

  async function save() {
    setBusy(true);
    try {
      if (training) {
        await updateTraining(db!, training, f!);
        await refresh();
        toast('האימון עודכן — כל הצוות קיבל התראה');
      } else {
        const id = await createTraining(db!, user!, f!);
        await refresh();
        toast('האימון נוצר ופורסם לצוות');
        if (id) router.push(`/trainings/${id}`);
      }
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'שמירת האימון נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={training ? 'עריכת אימון' : 'אימון חדש'}
      body="חובה: נושא, תאריך, שעות, מיקום, מפקד אימון, מדריך והוראות בטיחות. הלוגיסטיקה נוצרת אוטומטית לפי הנושא וניתנת לעריכה במסך האימון."
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            שמירה ופרסום
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="נושא">
          <select className="input" value={f.topic_id} onChange={onTopic}>
            {db.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="__new">נושא חדש…</option>
          </select>
        </Field>

        <Field label="צוות">
          <select
            className="input"
            value={f.team_id}
            onChange={(e) => setF((s) => (s ? { ...s, team_id: e.target.value as TrainingTeam } : s))}
          >
            <option value="a">{db.teams.a.name}</option>
            <option value="b">{db.teams.b.name}</option>
            <option value="joint">משותף — שני הצוותים</option>
          </select>
        </Field>

        {f.topic_id === '__new' && (
          <Field label="שם הנושא החדש" style={{ gridColumn: 'span 2' }}>
            <input
              className="input"
              value={f.new_topic}
              onChange={set('new_topic')}
              placeholder="לדוגמה: תרגול פינוי נפגעים ברכב"
            />
          </Field>
        )}

        <Field label="תאריך">
          <input className="input tabnum" type="date" value={f.date} onChange={set('date')} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="התחלה">
            <input className="input" type="time" value={f.start} onChange={set('start')} />
          </Field>
          <Field label="סיום">
            <input className="input" type="time" value={f.end} onChange={set('end')} />
          </Field>
        </div>

        <Field label="מיקום (הקלדה חופשית)">
          <input
            className="input"
            list="hapak-locs"
            value={f.location}
            onChange={set('location')}
            placeholder="לדוגמה: שטח אימונים ״רמה״"
          />
          <datalist id="hapak-locs">
            {db.locations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>

        <Field label="נצ״ד (רשת ישראל החדשה)">
          <input
            className="input tabnum"
            value={f.coords}
            onChange={set('coords')}
            placeholder="234700 652100"
          />
        </Field>

        <Field label="מפקד אימון">
          <select className="input" value={f.commander_id} onChange={set('commander_id')}>
            <option value="">בחר מפקד אימון</option>
            {commanderOpts.map((p) => (
              <option key={p.id} value={p.id}>
                {fullName(p)} · {roleLabel(db, p)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="מדריך">
          <select className="input" value={f.instructor_id} onChange={set('instructor_id')}>
            <option value="">בחר מדריך</option>
            {instructorOpts.map((p) => (
              <option key={p.id} value={p.id}>
                {fullName(p)}
                {p.is_instructor
                  ? ` · ${p.qual.map((q) => topicName(db, q)).join(', ') || 'מדריך'}`
                  : ' (לא מוסמך)'}
              </option>
            ))}
          </select>
        </Field>

        <Field label="תדרי קשר">
          <input className="input" value={f.freq} onChange={set('freq')} />
        </Field>

        <Field label="נקודת איסוף">
          <input className="input" value={f.pickup} onChange={set('pickup')} />
        </Field>

        <Field label="הוראות בטיחות (תבנית לפי נושא — ניתן לערוך)" style={{ gridColumn: 'span 2' }}>
          <textarea className="input" rows={3} value={f.safety} onChange={set('safety')} />
        </Field>

        <Field label="הערות (רשות)" style={{ gridColumn: 'span 2' }}>
          <input className="input" value={f.notes} onChange={set('notes')} />
        </Field>
      </div>

      <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
        מדריך ומפקד אימון יקבלו הזמנה ויידרשו לאשר תוך {db.settings.invite_hours} שעות. שינוי תאריך/שעות/מיקום שולח התראה לכל הצוות.
      </span>
    </Dialog>
  );
}
