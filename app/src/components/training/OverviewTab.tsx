'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { statusWord } from '@/components/TrainingCard';
import { AlertList, ProgressBar, SectionCard, Tag } from '@/components/ui/bits';
import { inviteOverdue, suggestSubstitute, trainingAlerts } from '@/lib/core/alerts';
import { reminderPreview, weatherEstimate } from '@/lib/core/calendar';
import { sunTimes } from '@/lib/core/dates';
import { permsFor } from '@/lib/core/permissions';
import {
  attendanceStats,
  byId,
  fullName,
  participants,
  personById,
} from '@/lib/core/selectors';
import type { InviteRole, TrainingFull } from '@/lib/core/types';
import {
  addDayBlock,
  attachOrder,
  invitePerson,
  removeRow,
  setEvacFromFleet,
  setTrainingField,
} from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

interface Props {
  training: TrainingFull;
  onInvite: (role: InviteRole) => void;
  onOpenAttendance: () => void;
}

export function OverviewTab({ training: t, onInvite }: Props) {
  const { db, user, today, now, toast, refresh } = useApp();
  const [blTime, setBlTime] = useState('');
  const [blTitle, setBlTitle] = useState('');
  const [weather, setWeather] = useState<{ hi: number; lo: number; text: string; live: boolean } | null>(null);

  // real forecast when the grid reference resolves, the local estimate otherwise
  useEffect(() => {
    let cancelled = false;
    const fallback = { ...weatherEstimate(t.date), live: false };
    if (!t.coords) {
      setWeather(fallback);
      return;
    }
    fetch(`/api/weather?coords=${encodeURIComponent(t.coords)}&date=${t.date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setWeather(d?.hi != null ? { ...d, live: true } : fallback);
      })
      .catch(() => !cancelled && setWeather(fallback));
    return () => {
      cancelled = true;
    };
  }, [t.coords, t.date]);

  if (!db || !user) return null;

  const perms = permsFor(db, user, t);
  const st = attendanceStats(db, t);
  const alerts = perms.seesStats ? trainingAlerts(db, t, today, now) : [];
  const sun = sunTimes(t.date);
  const ps = participants(db, t);
  const evac = byId(t.vehicles, t.evac_vehicle_id);
  // the fleet minus what is already on this training, matched by registration
  const onTraining = new Set(t.vehicles.map((v) => v.tz).filter(Boolean));
  const fleetSpare = db.fleet.filter((x) => x.active && !onTraining.has(x.tz));
  const isPart = ps.some((p) => p.id === user.id);

  const veh: Record<string, number> = {};
  t.vehicles.forEach((v) => {
    veh[v.type] = (veh[v.type] || 0) + 1;
  });
  const ammoTotal = t.ammo.reduce((s, a) => s + a.allocated, 0);
  const tags = [
    ...Object.entries(veh).map(([k, n]) => `${k} ×${n}`),
    ...(ammoTotal ? [`${ammoTotal.toLocaleString('en-US')} כד׳`] : []),
    ...t.food.slice(0, 3).map((f) => `${f.name} ${f.qty} ${f.unit}`),
  ];

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      await refresh();
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה');
    }
  };

  const inviteSuggested = async (role: InviteRole) => {
    const s = suggestSubstitute(db, t, role);
    if (!s) return toast('לא נמצא מחליף מתאים');
    await run(() => invitePerson(t.id, role, s.p.id), `הוזמן מחליף: ${fullName(s.p)}`);
  };

  return (
    <div className="hapak-overview">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionCard title="פרטי האימון">
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 13 }}>
            <Label>צוות</Label>
            <span>{t.team_id === 'joint' ? 'משותף' : db.teams[t.team_id].name}</span>

            <Label>מדריך</Label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {fullName(personById(db, t.instructor_id))}
              <span style={{ color: 'var(--color-neutral-500)' }}>· {statusWord(t.inst_status)}</span>
              {perms.canInvite && (
                <button
                  className="btn btn-ghost"
                  onClick={() => onInvite('instructor')}
                  style={{ fontSize: 12, padding: '2px 6px' }}
                >
                  הזמן / החלף
                </button>
              )}
              {perms.canInvite && inviteOverdue(db, t, 'instructor', today, now) && (
                <button
                  className="btn btn-primary"
                  onClick={() => void inviteSuggested('instructor')}
                  style={{ fontSize: 12, padding: '2px 8px', whiteSpace: 'nowrap' }}
                >
                  מעל {db.settings.invite_hours} שעות — הזמן מחליף מוצע
                </button>
              )}
            </span>

            <Label>מפקד אימון</Label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {fullName(personById(db, t.commander_id))}
              <span style={{ color: 'var(--color-neutral-500)' }}>· {statusWord(t.cmd_status)}</span>
              {perms.canInvite && (
                <button
                  className="btn btn-ghost"
                  onClick={() => onInvite('commander')}
                  style={{ fontSize: 12, padding: '2px 6px' }}
                >
                  הזמן / החלף
                </button>
              )}
              {perms.canInvite && inviteOverdue(db, t, 'commander', today, now) && (
                <button
                  className="btn btn-primary"
                  onClick={() => void inviteSuggested('commander')}
                  style={{ fontSize: 12, padding: '2px 8px', whiteSpace: 'nowrap' }}
                >
                  מעל {db.settings.invite_hours} שעות — הזמן מחליף מוצע
                </button>
              )}
            </span>

            <Label>נקודת איסוף</Label>
            <span className="tabnum">
              {t.pickup} · יציאה {t.departure}
            </span>

            <Label>תדרי קשר</Label>
            <span>{t.freq}</span>

            <Label>מזג אוויר</Label>
            <span>
              {weather
                ? `${weather.text} · ${weather.hi}° / ${weather.lo}°${weather.live ? '' : ' · הערכה בלבד'}`
                : '—'}
            </span>

            <Label>זריחה / שקיעה</Label>
            <span className="tabnum">
              זריחה {sun.rise} · שקיעה {sun.set}
            </span>

            <Label>חובש תורן</Label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{fullName(personById(db, t.medic_id))}</span>
              {perms.canEdit && (
                <select
                  className="input"
                  style={{ width: 'auto', minHeight: 28, padding: '1px 8px', fontSize: 12.5 }}
                  value={t.medic_id ?? ''}
                  onChange={(e) => void run(() => setTrainingField(t.id, 'medic_id', e.target.value))}
                >
                  <option value="">בחר חובש תורן</option>
                  {ps.map((p) => (
                    <option key={p.id} value={p.id}>
                      {fullName(p)}
                    </option>
                  ))}
                </select>
              )}
            </span>

            <Label>רכב פינוי</Label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{evac ? `${evac.type} צ׳ ${evac.tz}` : 'טרם נקבע'}</span>
              {/* an empty picker tells nobody why it is empty, and leaving him to
                  find the fleet screen on his own is the same problem again */}
              {perms.canEdit && t.vehicles.length === 0 && fleetSpare.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  אין רכבים במאגר —{' '}
                  <Link href="/logistics" style={{ color: 'var(--color-accent-300)' }}>
                    הוסף רכב לצי היחידה
                  </Link>{' '}
                  והוא ייבחר כאן.
                </span>
              )}
              {perms.canEdit && (t.vehicles.length > 0 || fleetSpare.length > 0) && (
                <select
                  className="input"
                  style={{ width: 'auto', minHeight: 28, padding: '1px 8px', fontSize: 12.5 }}
                  value={t.evac_vehicle_id ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const pick = val.startsWith('fleet:')
                      ? db.fleet.find((x) => x.id === val.slice(6))
                      : null;
                    void run(() =>
                      pick
                        ? setEvacFromFleet(t.id, pick, t.departure)
                        : setTrainingField(t.id, 'evac_vehicle_id', val),
                    );
                  }}
                >
                  <option value="">בחר רכב פינוי</option>
                  {t.vehicles.length > 0 && (
                    <optgroup label="רכבי האימון">
                      {t.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.type} צ׳ {v.tz}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {/* the rest of the fleet: choosing one puts it on the training
                      as well, so the evacuation vehicle is on the manifest and
                      not just a number written on this screen */}
                  {fleetSpare.length > 0 && (
                    <optgroup label="מצי הרכבים — יתווסף לאימון">
                      {fleetSpare.map((x) => (
                        <option key={x.id} value={`fleet:${x.id}`}>
                          {x.type} צ׳ {x.tz}
                          {x.fitness === 'כשיר' ? '' : ` · ${x.fitness}`}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </span>

            <Label>פקודת אימון</Label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>
                {t.order_file ? `${t.order_file.name} · ${t.order_file.size} KB` : 'לא צורפה פקודת אימון (PDF)'}
              </span>
              {perms.canEdit && (
                <label className="btn btn-secondary" style={{ fontSize: 12, padding: '3px 8px' }}>
                  צרף PDF
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void run(() => attachOrder(t.id, file), 'פקודת האימון צורפה');
                    }}
                  />
                </label>
              )}
            </span>
          </div>

          {t.notes && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-300)' }}>{t.notes}</p>
          )}
        </SectionCard>

        <SectionCard title="הוראות בטיחות">
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--color-neutral-300)', textWrap: 'pretty' }}>
            {t.safety || '—'}
          </p>
        </SectionCard>

        <AlertList items={alerts} title="התרעות למפקד" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionCard title="לו״ז יום האימון">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {t.day_blocks.map((b) => (
              <div
                key={b.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '52px 1fr auto',
                  gap: 10,
                  alignItems: 'center',
                  fontSize: 13,
                  padding: '5px 0',
                  borderBottom: '1px solid var(--color-neutral-900)',
                }}
              >
                <span className="tabnum" style={{ color: 'var(--color-accent-300)' }}>
                  {b.time}
                </span>
                <span>{b.title}</span>
                {perms.canEdit && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: '0 4px' }}
                    onClick={() => void run(() => removeRow('day_blocks', b.id))}
                  >
                    הסר
                  </button>
                )}
              </div>
            ))}
          </div>
          {perms.canEdit && (
            <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr auto', gap: 6, alignItems: 'center' }}>
              <input
                className="input tabnum"
                placeholder="09:30"
                value={blTime}
                onChange={(e) => setBlTime(e.target.value)}
                style={{ minHeight: 32 }}
              />
              <input
                className="input"
                placeholder="בלוק חדש"
                value={blTitle}
                onChange={(e) => setBlTitle(e.target.value)}
                style={{ minHeight: 32 }}
              />
              <button
                className="btn btn-secondary"
                onClick={() =>
                  void run(async () => {
                    await addDayBlock(t.id, blTime, blTitle);
                    setBlTime('');
                    setBlTitle('');
                  })
                }
              >
                הוסף
              </button>
            </div>
          )}
        </SectionCard>

        <SectionCard title="לוגיסטיקה בקצרה">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((tg, i) => (
              <Tag key={i}>{tg}</Tag>
            ))}
          </div>
          <ProgressBar pct={st.pct} label={`${st.responded}/${st.total} סימנו · ${st.expected} מגיעים`} />
        </SectionCard>

        {isPart && (
          <SectionCard title="התזכורות שלך לאימון">
            {reminderPreview(db, t, user).map((r, i) => (
              <span key={i} className="tabnum" style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>
                {r}
              </span>
            ))}
          </SectionCard>
        )}
      </div>

      <style jsx>{`
        .hapak-overview {
          display: grid;
          grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 1000px) {
          .hapak-overview {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--color-neutral-500)' }}>{children}</span>;
}
