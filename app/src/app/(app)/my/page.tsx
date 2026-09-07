'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AttendanceDialog } from '@/components/dialogs/AttendanceDialog';
import { FeedbackDialog } from '@/components/dialogs/FeedbackDialog';
import { useShareOrder } from '@/components/dialogs/TextDialog';
import { AlertList, Avatar, EmptyState, ProgressBar, SectionCard, Tag } from '@/components/ui/bits';
import { statusWord } from '@/components/TrainingCard';
import { trainingAlerts } from '@/lib/core/alerts';
import { reminderPreview, weatherEstimate } from '@/lib/core/calendar';
import { STATUS_LABEL, TRAINING_STATUS } from '@/lib/core/constants';
import { dateLine, pad, relDays, sunTimes, weekOf } from '@/lib/core/dates';
import { orderText } from '@/lib/core/exports';
import { permsFor } from '@/lib/core/permissions';
import {
  attendanceStats,
  byId,
  fullName,
  participants,
  personById,
  topicName,
  trainingTitle,
  upcomingFor,
} from '@/lib/core/selectors';
import {
  approveAttendance,
  reopenAttendance,
  summarizeAttendance,
} from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

/**
 * "האימון שלי" — the phone's second tab. Everything a fighter needs for the
 * next training on one scroll, and the commander's approval controls inline.
 */
export default function MyTrainingPage() {
  const { db, user, today, now, toast, refresh } = useApp();
  const router = useRouter();
  const [markPerson, setMarkPerson] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { share, dialog: shareDialog } = useShareOrder(toast);

  if (!db || !user) return null;

  const upcoming = upcomingFor(db, user, today);
  const t = upcoming[0] ?? null;

  if (!t)
    return (
      <EmptyState
        title="אין אימון קרוב"
        sub="כשיפורסם אימון לצוות שלך הוא יופיע כאן, עם סימון הנוכחות, הלוגיסטיקה והצ׳אט."
        action={
          <button className="btn btn-secondary" onClick={() => router.push('/schedule')}>
            ללו״ז התקופה
          </button>
        }
      />
    );

  const perms = permsFor(db, user, t);
  const st = attendanceStats(db, t);
  const ps = participants(db, t);
  const mine = t.attendance[user.id];
  const isPart = ps.some((p) => p.id === user.id);
  const canMark = isPart && t.status !== 'done' && t.status !== 'cancelled' && today <= t.date;
  const alerts = perms.seesStats ? trainingAlerts(db, t, today, now) : [];
  const sun = sunTimes(t.date);
  const weather = weatherEstimate(t.date);
  const evac = byId(t.vehicles, t.evac_vehicle_id);
  const unread = t.chat.filter((m) => !m.read_by.includes(user.id)).length;
  const rows = perms.seesList ? ps : ps.filter((p) => p.id === user.id);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await refresh();
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה');
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--color-accent)' }}>
          שבוע {pad(weekOf(db.settings.period_start, t.date))} · {trainingTitle(db, t)}
        </span>
        <Tag kind={t.team_id === 'joint' || t.status === 'done' ? 'accent' : 'neutral'}>
          {TRAINING_STATUS[t.status]}
        </Tag>
      </div>

      <h2 style={{ fontSize: 22, margin: 0 }}>{topicName(db, t.topic_id)}</h2>
      <span className="tabnum" style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>
        {dateLine(t)} · {relDays(today, t.date)}
      </span>

      {canMark && (
        <button className="btn btn-primary" onClick={() => setMarking(true)} style={{ minHeight: 48, fontSize: 15 }}>
          {mine ? 'עדכון נוכחות' : 'סימון נוכחות'}
        </button>
      )}
      <span style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>
        {mine
          ? `הסטטוס שלי: ${STATUS_LABEL[mine.status]}${mine.approved ? ' · אושר' : ''}`
          : isPart
            ? 'טרם סימנת נוכחות'
            : ''}
      </span>

      <AlertList items={alerts} title="התרעות למפקד" />

      <SectionCard>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 10px', fontSize: 12.5 }}>
          <Muted>מיקום</Muted>
          <span>
            {t.location}
            {t.coords ? (
              <>
                {' · נצ״ד '}
                <span className="tabnum">{t.coords}</span>
              </>
            ) : null}
          </span>
          <Muted>יציאה</Muted>
          <span className="tabnum">
            {t.departure} מ{t.pickup}
          </span>
          <Muted>מדריך</Muted>
          <span>
            {fullName(personById(db, t.instructor_id))} · {statusWord(t.inst_status)}
          </span>
          <Muted>מפקד אימון</Muted>
          <span>
            {fullName(personById(db, t.commander_id))} · {statusWord(t.cmd_status)}
          </span>
          <Muted>קשר</Muted>
          <span>{t.freq}</span>
          <Muted>מזג אוויר</Muted>
          <span>
            {weather.text} · {weather.hi}° / {weather.lo}° · הערכה
          </span>
          <Muted>זריחה / שקיעה</Muted>
          <span className="tabnum">
            {sun.rise} · {sun.set}
          </span>
          <Muted>חובש / פינוי</Muted>
          <span>
            {fullName(personById(db, t.medic_id))} · {evac ? `${evac.type} צ׳ ${evac.tz}` : 'טרם נקבע'}
          </span>
        </div>
      </SectionCard>

      <SectionCard title="לו״ז יום האימון">
        {t.day_blocks.map((b) => (
          <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '48px 1fr', gap: 10, fontSize: 12.5, padding: '3px 0' }}>
            <span className="tabnum" style={{ color: 'var(--color-accent-300)' }}>
              {b.time}
            </span>
            <span>{b.title}</span>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="הוראות בטיחות">
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-neutral-300)' }}>{t.safety}</p>
      </SectionCard>

      <SectionCard title="לוגיסטיקה">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {t.vehicles.map((v) => (
            <Tag key={v.id}>
              {v.type} צ׳ {v.tz || '—'}
            </Tag>
          ))}
          {t.food.map((f) => (
            <Tag key={f.id}>
              {f.name} {f.qty} {f.unit}
            </Tag>
          ))}
        </div>
        {t.ammo.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5 }}>
            <Muted>תחמושת</Muted>
            {t.ammo.map((a) => (
              <span key={a.id}>
                {a.weapon}: {a.allocated.toLocaleString('en-US')} כד׳
                {a.per_fighter ? ` (${a.per_fighter} ללוחם)` : ''}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: 12, color: 'var(--color-neutral-400)' }}>
          {t.gear.map((g) => (
            <span key={g.id}>
              {g.name} ×{g.qty}
              {g.returned ? ' ✓' : ''}
            </span>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="נוכחות"
        right={
          <span style={{ fontSize: 11.5, color: 'var(--color-neutral-400)' }}>
            {st.responded}/{st.total} סימנו · {st.expected} מגיעים
          </span>
        }
      >
        <ProgressBar pct={st.pct} label={`${st.approved} מאושרים`} />
        <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
          {t.approved_all
            ? 'הנוכחות הסופית אושרה'
            : t.trainer_summarized
              ? 'מפקד האימון סיכם — ממתין לאישור מפקד הצוות'
              : 'הנוכחות פתוחה לסימון עד תחילת האימון'}
        </span>

        {rows.map((p) => {
          const a = t.attendance[p.id];
          const canEditRow = (p.id === user.id && canMark) || perms.canApprove || perms.isTrainCmd;
          return (
            <div
              key={p.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr auto',
                gap: 8,
                alignItems: 'center',
                padding: '5px 0',
                borderBottom: '1px solid var(--color-neutral-900)',
              }}
            >
              <Avatar name={p.name} size={28} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 13 }}>{fullName(p)}</span>
                <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
                  {p.role}
                  {a?.reason ? ` · ${a.reason}` : ''}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag
                  kind={!a ? 'outline' : a.status === 'coming' ? 'accent' : 'neutral'}
                  style={{ fontSize: 10.5 }}
                >
                  {a ? STATUS_LABEL[a.status] : 'לא הגיב'}
                </Tag>
                {a?.approved && <span style={{ fontSize: 10.5, color: 'var(--color-accent-300)' }}>אושר</span>}
                {perms.canApprove && !a?.approved && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 11.5, padding: '2px 6px' }}
                    onClick={() => void run(() => approveAttendance(t.id, p.id), 'הנוכחות אושרה')}
                  >
                    אשר
                  </button>
                )}
                {canEditRow && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 11.5, padding: '2px 6px' }}
                    onClick={() => setMarkPerson(p.id)}
                  >
                    עדכן
                  </button>
                )}
              </span>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {perms.canSummarize && !t.trainer_summarized && t.status !== 'cancelled' && (
            <button
              className="btn btn-secondary"
              style={{ flex: 1, minHeight: 40 }}
              onClick={() => void run(() => summarizeAttendance(t.id), 'סיכום הנוכחות נשלח למפקד הצוות')}
            >
              סיכום נוכחות
            </button>
          )}
          {perms.canApprove && !t.approved_all && t.status !== 'cancelled' && (
            <button
              className="btn btn-primary"
              style={{ flex: 1, minHeight: 40 }}
              onClick={() => void run(() => approveAttendance(t.id), 'הנוכחות הסופית אושרה')}
            >
              אישור סופי לכולם
            </button>
          )}
          {perms.canApprove && t.approved_all && (
            <button
              className="btn btn-secondary"
              style={{ minHeight: 40 }}
              onClick={() => void run(() => reopenAttendance(t.id), 'הנוכחות נפתחה מחדש')}
            >
              פתיחה מחדש
            </button>
          )}
        </div>
      </SectionCard>

      {t.status === 'done' && isPart && (
        <div
          className="card"
          style={{ padding: '10px 12px', gap: 8, boxShadow: '0 0 0 1px var(--color-accent-700)' }}
        >
          <span style={{ fontSize: 13 }}>
            {t.feedback[user.id]
              ? `המשוב שלך: כללי ${t.feedback[user.id].overall}/5`
              : 'האימון הסתיים — נשמח למשוב קצר'}
          </span>
          <button className="btn btn-primary" style={{ minHeight: 44 }} onClick={() => setFeedbackOpen(true)}>
            {t.feedback[user.id] ? 'עדכון משוב' : 'משוב על האימון'}
          </button>
        </div>
      )}

      {isPart &&
        reminderPreview(db, t, user).map((r, i) => (
          <span key={i} className="tabnum" style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
            {r}
          </span>
        ))}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-secondary"
          style={{ flex: 1, minHeight: 44 }}
          onClick={() => share(orderText(db, t))}
        >
          שיתוף פקודת אימון
        </button>
        <button
          className="btn btn-ghost"
          style={{ minHeight: 44 }}
          onClick={() => router.push('/chat')}
        >
          {unread ? `צ׳אט (${unread})` : 'צ׳אט'}
        </button>
        <button
          className="btn btn-ghost"
          style={{ minHeight: 44 }}
          onClick={() => router.push(`/trainings/${t.id}`)}
        >
          מסך מלא
        </button>
      </div>

      {upcoming.length > 1 && (
        <>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginTop: 6 }}>אימונים נוספים</span>
          {upcoming.slice(1, 4).map((o) => (
            <button
              key={o.id}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start', minHeight: 44, fontSize: 12.5 }}
              onClick={() => router.push(`/trainings/${o.id}`)}
            >
              {trainingTitle(db, o)} · {topicName(db, o.topic_id)} · {relDays(today, o.date)}
            </button>
          ))}
        </>
      )}

      {(marking || markPerson) && (
        <AttendanceDialog
          training={t}
          personId={markPerson}
          sheet
          onClose={() => {
            setMarking(false);
            setMarkPerson(null);
          }}
        />
      )}
      {feedbackOpen && <FeedbackDialog training={t} sheet onClose={() => setFeedbackOpen(false)} />}
      {shareDialog}
    </>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--color-neutral-500)' }}>{children}</span>;
}
