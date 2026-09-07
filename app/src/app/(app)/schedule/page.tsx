'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AttendanceDialog } from '@/components/dialogs/AttendanceDialog';
import { TrainingFormDialog } from '@/components/dialogs/TrainingFormDialog';
import { useShareOrder } from '@/components/dialogs/TextDialog';
import { TrainingCard } from '@/components/TrainingCard';
import { EmptyState, ScoreBar, SectionCard, Tag } from '@/components/ui/bits';
import { calendarEventsFor } from '@/lib/core/calendar';
import { STATUS_LABEL } from '@/lib/core/constants';
import {
  dayLetter,
  daysBetween,
  fmtFull,
  fmtShort,
  pad,
  weekOf,
  weekRange,
  weekStart,
} from '@/lib/core/dates';
import { scheduleHTML, printHTML } from '@/lib/core/exports';
import { readinessOf } from '@/lib/core/readiness';
import {
  activeTrainings,
  bannerTrainings,
  clampWeek,
  participants,
  periodWeeks,
  topicName,
  trainingTitle,
  upcomingFor,
} from '@/lib/core/selectors';
import type { TeamKey, TrainingFull } from '@/lib/core/types';
import { useApp } from '@/lib/data/provider';

/**
 * The home screen: the period timeline (layout C — weeks as columns, a row per
 * team, joint weeks merged into one cell), then the selected week in detail.
 */
export default function SchedulePage() {
  const app = useApp();
  const router = useRouter();
  const { db, user, perms, today, now, toast } = app;
  const [sel, setSel] = useState<number | null>(null);
  const [markTraining, setMarkTraining] = useState<TrainingFull | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const { share, dialog: shareDialog } = useShareOrder(toast);

  const view = useMemo(() => {
    if (!db || !user) return null;
    const N = periodWeeks(db);
    const week = sel ?? clampWeek(db, weekOf(db.settings.period_start, today));
    const live = db.trainings.filter((t) => t.status !== 'cancelled');
    const inWeek = (w: number) => live.filter((t) => weekOf(db.settings.period_start, t.date) === w);

    let jointCount = 0;
    let teamWeeks = 0;
    for (let w = 1; w <= N; w++) {
      const ts = inWeek(w);
      const joint = ts.filter((t) => t.team_id === 'joint');
      const team = ts.filter((t) => t.team_id !== 'joint');
      if (joint.length && !team.length) jointCount++;
      else if (team.length) teamWeeks++;
    }

    const first = live.map((t) => t.date).sort()[0];
    const last = live
      .map((t) => t.end_date || t.date)
      .sort()
      .slice(-1)[0];

    return { N, week, live, inWeek, jointCount, teamWeeks, first, last };
  }, [db, user, sel, today]);

  if (!db || !user || !view) return null;

  const { N, week, live, inWeek, jointCount, teamWeeks, first, last } = view;
  const selTrainings = inWeek(week);
  const isJointWeek = selTrainings.length > 0 && selTrainings.every((t) => t.team_id === 'joint');
  const banners = bannerTrainings(db, user, today);
  const next = upcomingFor(db, user, today)[0] ?? null;
  const calEvents = calendarEventsFor(db, week);

  const periodMeta = first
    ? `${fmtShort(first)} – ${fmtFull(last)} · ${teamWeeks} שבועות סבב צוותים · ${jointCount} שבועות משותפים · היום ${fmtShort(today)}${
        first > today ? `, ${daysBetween(today, first)} ימים לתחילת התקופה` : ''
      }`
    : 'אין אימונים בתקופה עדיין — התבנית ריקה';

  const printSchedule = () => {
    const ok = printHTML(
      db.settings.app_name,
      scheduleHTML(db, activeTrainings(db), (iso) => weekOf(db.settings.period_start, iso)),
    );
    toast(ok ? 'נפתח חלון הדפסה' : 'הדפדפן חסם את חלון ההדפסה');
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 26, margin: '0 0 4px' }}>תקופת אימונים · {db.settings.period_name}</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-500)' }}>{periodMeta}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--color-neutral-400)', flexWrap: 'wrap' }}>
          <Legend color="var(--color-neutral-700)" label={db.teams.a.name} />
          <Legend color="var(--color-neutral-800)" label={db.teams.b.name} ring />
          <Legend color="var(--color-accent-800)" label="משותף" />
          <button className="btn btn-secondary" onClick={printSchedule}>
            הדפסת לו״ז
          </button>
          {perms.canCreate && (
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
              + אימון חדש
            </button>
          )}
        </div>
      </div>

      {/* today / tomorrow */}
      {banners.map((t) => {
        const mine = t.attendance[user.id];
        const isPart = participants(db, t).some((p) => p.id === user.id);
        return (
          <div
            key={t.id}
            className="card elev-md"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              padding: '12px 16px',
              flexWrap: 'wrap',
              boxShadow: '0 0 0 1px var(--color-accent)',
            }}
          >
            <Tag kind="accent" style={{ fontSize: 13, padding: '4px 10px' }}>
              {t.date === today ? 'היום' : 'מחר'}
            </Tag>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 240 }}>
              <span className="card-title" style={{ fontSize: 16 }}>
                {topicName(db, t.topic_id)} · {trainingTitle(db, t)}
              </span>
              <span className="tabnum" style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>
                יציאה {t.departure} מ{t.pickup} · {t.location} · {t.start}–{t.end}
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
                {mine ? `הסטטוס שלי: ${STATUS_LABEL[mine.status]}` : isPart ? 'טרם סימנת נוכחות' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {isPart && !mine && today <= t.date && (
                <button className="btn btn-primary" onClick={() => setMarkTraining(t)} style={{ whiteSpace: 'nowrap' }}>
                  סימון נוכחות
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => router.push(`/trainings/${t.id}`)}
                style={{ whiteSpace: 'nowrap' }}
              >
                פרטי האימון
              </button>
            </div>
          </div>
        );
      })}

      {!live.length && (
        <EmptyState
          title="התבנית ריקה — עדיין אין אימונים בתקופה"
          sub="מנהל המערכת או מפקד החפ״ק יכולים ליצור סבב אוטומטי, להוסיף אימונים ידנית או לשחזר תבנית לדוגמה."
          action={
            perms.isAdmin ? (
              <Link className="btn btn-primary" href="/manage">
                לניהול התקופה
              </Link>
            ) : undefined
          }
        />
      )}

      {next && (
        <div
          className="card elev-sm"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: '10px 16px', flexWrap: 'wrap' }}
        >
          <Tag kind="accent">האימון הקרוב שלך</Tag>
          <span className="card-title" style={{ fontSize: 15 }}>
            {topicName(db, next.topic_id)}
          </span>
          <span className="tabnum" style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>
            {trainingTitle(db, next)} · יום {dayLetter(next.date)} {fmtShort(next.date)} {next.start}–{next.end} ·{' '}
            {next.location}
          </span>
          <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
            {participants(db, next).some((p) => p.id === user.id) &&
              today <= next.date &&
              next.status !== 'done' && (
                <button className="btn btn-primary" onClick={() => setMarkTraining(next)} style={{ whiteSpace: 'nowrap' }}>
                  {next.attendance[user.id] ? 'עדכון נוכחות' : 'סימון נוכחות'}
                </button>
              )}
            <button
              className="btn btn-secondary"
              onClick={() => router.push(`/trainings/${next.id}`)}
              style={{ whiteSpace: 'nowrap' }}
            >
              פרטי האימון
            </button>
          </div>
        </div>
      )}

      {/* ── the period timeline ───────────────────────────────────────────── */}
      <section className="card hapak-timeline" style={{ padding: '14px 16px', gap: 8 }}>
        <div
          className="hapak-timeline-grid"
          style={{ display: 'grid', gridTemplateColumns: `72px repeat(${N}, minmax(0,1fr))`, gap: 6, alignItems: 'stretch' }}
        >
          <div style={{ gridColumn: 1, gridRow: 1, fontSize: 12, display: 'flex', alignItems: 'center', color: 'var(--color-neutral-400)' }}>
            שבוע
          </div>
          <div style={{ gridColumn: 1, gridRow: 2, fontSize: 12, display: 'flex', alignItems: 'center', color: 'var(--color-neutral-400)' }}>
            {db.teams.a.name}
          </div>
          <div style={{ gridColumn: 1, gridRow: 3, fontSize: 12, display: 'flex', alignItems: 'center', color: 'var(--color-neutral-400)' }}>
            {db.teams.b.name}
          </div>

          {Array.from({ length: N }, (_, i) => i + 1).map((w) => {
            const col = w + 1;
            const selected = w === week;
            const ts = inWeek(w);
            const joint = ts.filter((t) => t.team_id === 'joint');
            const team = ts.filter((t) => t.team_id !== 'joint');
            const isToday = w === weekOf(db.settings.period_start, today);
            const ring = selected ? '0 0 0 1px var(--color-accent)' : 'none';

            return (
              <WeekColumn
                key={w}
                col={col}
                week={w}
                selected={selected}
                isToday={isToday}
                dateLabel={fmtShort(weekStart(db.settings.period_start, w))}
                onSelect={() => setSel(w)}
              >
                {joint.length > 0 && team.length === 0 ? (
                  <button
                    onClick={() => setSel(w)}
                    style={{
                      gridColumn: col,
                      gridRow: '2 / span 2',
                      padding: '10px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: 0,
                      cursor: 'pointer',
                      textAlign: 'start',
                      color: 'var(--color-accent-100)',
                      fontFamily: 'inherit',
                      fontSize: 12,
                      lineHeight: 1.3,
                      background: 'var(--color-accent-900)',
                      boxShadow: ring,
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--color-accent-300)', marginBottom: 4 }}>
                      משותף
                    </span>
                    {topicName(db, joint[0].topic_id)}
                    <span className="tabnum" style={{ display: 'block', fontSize: 11, color: 'var(--color-accent-300)' }}>
                      {dayLetter(joint[0].date)} {fmtShort(joint[0].date)}
                      {joint.length > 1 ? ` +${joint.length - 1}` : ''}
                    </span>
                  </button>
                ) : (
                  (['a', 'b'] as TeamKey[]).map((tm, i) => {
                    const t = team.find((x) => x.team_id === tm);
                    const row = i + 2;
                    if (!t && !joint.length)
                      return (
                        <button
                          key={tm}
                          onClick={() => setSel(w)}
                          style={{
                            gridColumn: col,
                            gridRow: row,
                            padding: 8,
                            borderRadius: 'var(--radius-sm)',
                            border: '1px dashed var(--color-neutral-800)',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: 11.5,
                            color: 'var(--color-neutral-600)',
                            display: 'grid',
                            placeItems: 'center',
                            fontFamily: 'inherit',
                          }}
                        >
                          —
                        </button>
                      );
                    const shown = t ?? joint[0];
                    const isJoint = !t;
                    return (
                      <button
                        key={tm}
                        onClick={() => setSel(w)}
                        style={{
                          gridColumn: col,
                          gridRow: row,
                          padding: 8,
                          borderRadius: 'var(--radius-sm)',
                          border: 0,
                          cursor: 'pointer',
                          textAlign: 'start',
                          color: 'inherit',
                          fontFamily: 'inherit',
                          fontSize: 12,
                          lineHeight: 1.3,
                          background: isJoint
                            ? 'var(--color-accent-900)'
                            : tm === 'a'
                              ? 'var(--color-neutral-700)'
                              : 'var(--color-neutral-800)',
                          boxShadow: selected
                            ? '0 0 0 1px var(--color-accent)'
                            : tm === 'b' && !isJoint
                              ? 'inset 0 0 0 1px var(--color-neutral-700)'
                              : 'none',
                        }}
                      >
                        {topicName(db, shown.topic_id)}
                        <span className="tabnum" style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-400)' }}>
                          {isJoint ? 'משותף · ' : ''}
                          {dayLetter(shown.date)} {fmtShort(shown.date)}
                          {shown.status === 'done' ? ' · הסתיים' : ''}
                        </span>
                      </button>
                    );
                  })
                )}
              </WeekColumn>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--color-neutral-500)',
            paddingTop: 4,
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <span>שלב א׳ · סבב צוותים מדורג — צוות ב׳ עושה את אותו אימון שבוע אחרי צוות א׳</span>
          <span>שלב ב׳ · אימון משותף לשני הצוותים</span>
        </div>
      </section>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 18, margin: 0 }}>
          שבוע {pad(week)} · {weekRange(db.settings.period_start, week)}
        </h3>
        <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
          לחיצה על שבוע בציר מחליפה את הפירוט
        </span>
      </div>

      <section className="hapak-week-detail">
        {isJointWeek
          ? selTrainings.map((t) => (
              <TrainingCard
                key={t.id}
                db={db}
                user={user}
                today={today}
                now={now}
                training={t}
                span={2}
                onMark={() => setMarkTraining(t)}
                onShareOrder={share}
              />
            ))
          : (['a', 'b'] as TeamKey[]).map((tm) => {
              const t =
                selTrainings.find((x) => x.team_id === tm) ?? selTrainings.find((x) => x.team_id === 'joint');
              if (t)
                return (
                  <TrainingCard
                    key={tm}
                    db={db}
                    user={user}
                    today={today}
                    now={now}
                    training={t}
                    onMark={() => setMarkTraining(t)}
                    onShareOrder={share}
                  />
                );
              const nxt = live
                .filter((x) => x.team_id === tm && weekOf(db.settings.period_start, x.date) > week)
                .sort((a, b) => a.date.localeCompare(b.date))[0];
              return (
                <div
                  key={tm}
                  style={{
                    border: '1px dashed var(--color-neutral-800)',
                    borderRadius: 'var(--radius-md)',
                    padding: '18px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    minHeight: 120,
                  }}
                >
                  <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>{db.teams[tm].name}</span>
                  <span style={{ fontSize: 15, color: 'var(--color-neutral-400)' }}>אין אימון בשבוע זה</span>
                  <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>
                    {nxt
                      ? `האימון הבא: ${topicName(db, nxt.topic_id)} · יום ${dayLetter(nxt.date)} ${fmtShort(nxt.date)}`
                      : 'אין אימונים נוספים מתוכננים'}
                  </span>
                </div>
              );
            })}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionCard
            title="יומן המח״ט · השבוע"
            right={
              <span style={{ fontSize: 10.5, color: 'var(--color-neutral-500)' }}>הזנה ידנית · מנהל המערכת</span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
              {calEvents.map((e) => (
                <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '48px 1fr', gap: 10 }}>
                  <span className="tabnum" style={{ color: 'var(--color-neutral-500)' }}>
                    {dayLetter(e.date)} {fmtShort(e.date)}
                  </span>
                  <span style={{ color: e.special ? 'var(--color-accent-300)' : 'var(--color-text)' }}>
                    <span className="tabnum" style={{ color: 'var(--color-neutral-400)' }}>
                      {e.time}
                    </span>{' '}
                    {e.title}
                  </span>
                </div>
              ))}
              {!calEvents.length && (
                <span style={{ color: 'var(--color-neutral-500)' }}>אין אירועים בשבוע זה</span>
              )}
            </div>
          </SectionCard>

          {perms.seesStats && (
            <SectionCard title="כשירות צוותים · 1–10">
              {(['a', 'b'] as TeamKey[]).map((tm) => {
                const r = readinessOf(db, (p) => p.team_id === tm);
                return (
                  <div
                    key={tm}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '56px 1fr auto',
                      gap: 10,
                      alignItems: 'center',
                      fontSize: 12.5,
                    }}
                  >
                    <span>{db.teams[tm].name}</span>
                    <ScoreBar score={r.score} />
                    <span className="tabnum">{r.score.toFixed(1)}</span>
                  </div>
                );
              })}
              <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
                דירוג מפקד 50% · נוכחות מאושרת 25% · נושאים שהושלמו 25%
              </span>
            </SectionCard>
          )}
        </div>
      </section>

      <AttendanceDialog training={markTraining} personId={null} onClose={() => setMarkTraining(null)} />
      <TrainingFormDialog open={newOpen} training={null} week={week} onClose={() => setNewOpen(false)} />
      {shareDialog}

      <style jsx>{`
        .hapak-week-detail {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 300px;
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 1100px) {
          .hapak-week-detail {
            grid-template-columns: minmax(0, 1fr);
          }
        }
        @media (max-width: 767px) {
          /* the timeline scrolls sideways on a phone, as in the app prototype */
          .hapak-timeline {
            overflow-x: auto;
          }
          .hapak-timeline-grid {
            min-width: 640px;
          }
        }
      `}</style>
    </>
  );
}

function Legend({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: color,
          boxShadow: ring ? 'inset 0 0 0 1px var(--color-neutral-600)' : undefined,
        }}
      />
      {label}
    </span>
  );
}

function WeekColumn({
  col,
  week,
  selected,
  isToday,
  dateLabel,
  onSelect,
  children,
}: {
  col: number;
  week: number;
  selected: boolean;
  isToday: boolean;
  dateLabel: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        onClick={onSelect}
        aria-pressed={selected}
        style={{
          gridColumn: col,
          gridRow: 1,
          padding: '4px 6px',
          borderRadius: 'var(--radius-sm)',
          border: 0,
          cursor: 'pointer',
          textAlign: 'start',
          display: 'flex',
          flexDirection: 'column',
          lineHeight: 1.2,
          color: 'inherit',
          fontFamily: 'inherit',
          background: selected ? 'var(--color-accent-900)' : 'transparent',
        }}
      >
        <span style={{ fontSize: 11, color: selected ? 'var(--color-accent-300)' : 'var(--color-neutral-500)' }}>
          {pad(week)}
        </span>
        <span className="tabnum" style={{ fontSize: 12, color: selected ? 'var(--color-accent-100)' : 'var(--color-text)' }}>
          {dateLabel}
        </span>
        {isToday && <span style={{ fontSize: 10, color: 'var(--color-accent)' }}>היום</span>}
      </button>
      {children}
    </>
  );
}
