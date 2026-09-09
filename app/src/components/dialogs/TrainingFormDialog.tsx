'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { LogisticsEditor, type LogisticsDraft } from '@/components/dialogs/LogisticsEditor';
import { Field } from '@/components/ui/bits';
import { DEFAULT_FREQ, DEFAULT_PICKUP, DEPARTURE_LEAD_MINUTES, FIRE_MODES } from '@/lib/core/constants';
import { addDays, addMinutes, weekStart } from '@/lib/core/dates';
import { defaultLogistics } from '@/lib/core/defaults';
import { roleLabel } from '@/lib/core/permissions';
import { fullName, topicName, topicSafety } from '@/lib/core/selectors';
import type { Db, FireMode, TrainingFull, TrainingTeam } from '@/lib/core/types';
import { createTraining, updateTraining, type TrainingForm } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

interface Props {
  open: boolean;
  training: TrainingFull | null; // null = new
  /** A training to copy: the form opens as a new one, filled in from it. */
  duplicateOf?: TrainingFull | null;
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
  departure: '',
  fire_mode: 'wet',
  safety,
  notes: '',
});

/** The proposal the system makes for a training's kit, from topic and roster. */
const proposeLogistics = (
  db: Db,
  topicId: string,
  teamId: TrainingTeam,
  start: string,
  location: string,
  date: string,
  mode: FireMode,
): LogisticsDraft =>
  defaultLogistics(
    topicId === '__new' ? '' : topicId,
    teamId,
    start || '07:00',
    db.people,
    location,
    Object.values(db.teams)
      .filter((t) => t.attends_all)
      .map((t) => t.id),
    date,
    mode,
  );

/** Nothing is chosen for the commander; he adds what the day needs. */
const EMPTY_LOGISTICS: LogisticsDraft = { gear: [], vehicles: [], ammo: [], food: [] };

/**
 * The kit of one training, ready to be the kit of the next.
 *
 * The plan comes across; what happened on the day does not — nothing is
 * returned or missing yet, no rounds have been fired, and no vehicle has a
 * fault. The driver is left out on purpose: who drives is a decision for that
 * day, and a licence in date last month may not be in date now.
 */
const copyLogistics = (t: TrainingFull): LogisticsDraft => ({
  gear: t.gear.map((g) => ({ name: g.name, qty: g.qty, returned: false, missing: '', owner_id: null })),
  vehicles: t.vehicles.map((v) => ({
    type: v.type,
    tz: v.tz,
    driver_id: null,
    seats: v.seats,
    departure: v.departure,
    fitness: v.fitness,
    fault: '',
  })),
  ammo: t.ammo.map((a) => ({
    weapon: a.weapon,
    per_fighter: a.per_fighter,
    allocated: a.allocated,
    used: 0,
  })),
  food: t.food.map((x) => ({ name: x.name, qty: x.qty, unit: x.unit, note: x.note })),
});

/** What the gathering time would be if nobody sets one. */
const suggestedDeparture = (start: string): string =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(start) ? addMinutes(start, -DEPARTURE_LEAD_MINUTES) : '';

/** Every field the unit made mandatory before a training may be published. */
export function TrainingFormDialog({ open, training, duplicateOf = null, week = 1, onClose }: Props) {
  const { db, user, toast, refresh } = useApp();
  const router = useRouter();
  const [f, setF] = useState<TrainingForm | null>(null);
  const [busy, setBusy] = useState(false);
  // The kit proposal follows the topic, team, time and location until the
  // commander edits it — after that their list is the one that counts.
  const [logi, setLogi] = useState<LogisticsDraft | null>(null);

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
        departure: training.departure,
        fire_mode: training.fire_mode,
        safety: training.safety,
        notes: training.notes,
      });
    } else if (duplicateOf) {
      // Everything the day is made of, on a new date a week later. The date is
      // the one thing that must not be inherited, and the commander is looking
      // straight at it before he saves.
      const d = duplicateOf;
      setF({
        topic_id: d.topic_id,
        new_topic: '',
        team_id: d.team_id,
        date: addDays(d.date, 7),
        start: d.start,
        end: d.end,
        location: d.location,
        coords: d.coords,
        commander_id: d.commander_id ?? '',
        instructor_id: d.instructor_id ?? '',
        freq: d.freq,
        pickup: d.pickup,
        departure: d.departure,
        fire_mode: d.fire_mode,
        safety: d.safety,
        notes: d.notes,
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
    setLogi(null);
  }, [open, training, duplicateOf, db, week]);

  // A new training starts with nothing chosen. The system used to fill the kit
  // in by itself — three vehicles, ammunition by topic — and a list somebody
  // else wrote is a list nobody reads: it gets published as-is, and then the
  // wrong vehicle turns up. What the commander adds is what the team gets. The
  // proposal is still there, one button away, for whoever wants it.
  useEffect(() => {
    if (!open || !db || training) return;
    // A copy is the exception: its whole point is that the kit comes with it.
    // The driver is left out — who drives is a decision for that day, and a
    // licence that was in date last month may not be in date now.
    setLogi(
      (cur) =>
        cur ??
        (duplicateOf ? copyLogistics(duplicateOf) : EMPTY_LOGISTICS),
    );
  }, [open, db, training, duplicateOf]);

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
  // Only a certified instructor may be named instructor of a training — the
  // flag is what makes someone one, whether or not they belong to a team.
  const instructorOpts = people.filter((p) => p.is_instructor);
  // Command of a training is a team commander's and above.
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
        const id = await createTraining(db!, user!, {
          ...f!,
          ...cleanLogistics(logi),
          // a copy brings the day's shape and its stations with it
          ...(duplicateOf
            ? {
                day_blocks: duplicateOf.day_blocks.map((b) => ({ time: b.time, title: b.title })),
                drills: duplicateOf.drills.map((d) => ({
                  name: d.name,
                  description: d.description,
                  kind: d.kind,
                  rounds: d.rounds,
                  weight: d.weight,
                })),
              }
            : {}),
        });
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
      title={training ? 'עריכת אימון' : duplicateOf ? 'שכפול אימון' : 'אימון חדש'}
      body={
        training
          ? 'חובה: נושא, תאריך, שעות, מיקום, מפקד אימון, מדריך והוראות בטיחות.'
          : duplicateOf
            ? 'הכול הועתק מהאימון הקודם — הציוד, הרכבים, התחמושת, מהלך היום והמקצים. בדוק את התאריך, שבץ נהגים, ושמור.'
            : 'חובה: נושא, תאריך, שעות, מיקום, מפקד אימון, מדריך והוראות בטיחות. הציוד, הרכבים, התחמושת והמזון מתווספים למטה — מה שתוסיף הוא מה שהצוות יראה.'
      }
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

        <Field label="סוג האימון">
          <select
            className="input"
            value={f.fire_mode}
            onChange={(e) => setF((s) => (s ? { ...s, fire_mode: e.target.value as FireMode } : s))}
          >
            {FIRE_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.note}
              </option>
            ))}
          </select>
        </Field>

        <Field label="תדרי קשר">
          <input className="input" value={f.freq} onChange={set('freq')} />
        </Field>

        <Field label="נקודת התכנסות">
          <input className="input" value={f.pickup} onChange={set('pickup')} />
        </Field>

        <Field label="שעת התכנסות בנקודה">
          <input
            className="input tabnum"
            type="time"
            value={f.departure || suggestedDeparture(f.start)}
            onChange={set('departure')}
          />
          <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
            ברירת המחדל שעה וחצי לפני תחילת האימון · שעת היציאה של הרכבים מתעדכנת יחד איתה
          </span>
        </Field>

        <Field label="הוראות בטיחות (תבנית לפי נושא — ניתן לערוך)" style={{ gridColumn: 'span 2' }}>
          <textarea className="input" rows={3} value={f.safety} onChange={set('safety')} />
        </Field>

        <Field label="הערות (רשות)" style={{ gridColumn: 'span 2' }}>
          <input className="input" value={f.notes} onChange={set('notes')} />
        </Field>
      </div>

      {!training && logi && (
        <LogisticsEditor
          db={db}
          value={logi}
          onChange={(next) => {
            setLogi(next);
          }}
          onReset={() => {
            setLogi(proposeLogistics(db, f.topic_id, f.team_id, f.start, f.location, f.date, f.fire_mode));
          }}
        />
      )}

      {training && (
        <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
          ציוד, רכבים, תחמושת ומזון של אימון קיים נערכים בלשונית ״לוגיסטיקה״ של האימון.
        </span>
      )}

      <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
        מדריך ומפקד אימון יקבלו הזמנה ויידרשו לאשר תוך {db.settings.invite_hours} שעות. שינוי תאריך/שעות/מיקום שולח התראה לכל הצוות.
      </span>
    </Dialog>
  );
}

/** Drops the blank rows a half-filled form leaves behind. */
function cleanLogistics(l: LogisticsDraft | null) {
  if (!l) return {};
  return {
    gear: l.gear.filter((g) => g.name.trim()),
    vehicles: l.vehicles.filter((v) => v.type.trim()),
    ammo: l.ammo.filter((a) => a.weapon.trim()),
    food: l.food.filter((x) => x.name.trim()),
  };
}
