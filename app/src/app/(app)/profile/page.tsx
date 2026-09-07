'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PersonDialog } from '@/components/dialogs/PersonDialog';
import { SettingsDialog } from '@/components/dialogs/SettingsDialog';
import { Avatar, ScoreBar, SectionCard } from '@/components/ui/bits';
import { certStatus } from '@/lib/core/alerts';
import { CERT_TYPES, STATUS_LABEL } from '@/lib/core/constants';
import { fmtFull, fmtShort } from '@/lib/core/dates';
import { roleLabel } from '@/lib/core/permissions';
import { readinessOf } from '@/lib/core/readiness';
import { participants, teamName, topicName, trainingTitle } from '@/lib/core/selectors';
import type { NotifPrefs } from '@/lib/core/types';
import { setMyNotif } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';
import { PushToggle } from '@/components/PushToggle';

const PREF_LABELS: [keyof NotifPrefs, string][] = [
  ['evening', 'תזכורת ערב לפני'],
  ['morning', 'תזכורת בבוקר האימון (שעתיים לפני היציאה)'],
  ['approved', 'כשהנוכחות שלי אושרה'],
  ['changed', 'כשאימון של הצוות שונה או נדחה'],
];

export default function ProfilePage() {
  const { db, user, perms, today, toast, refresh, signOut } = useApp();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!db || !user) return null;

  const r = readinessOf(db, (p) => p.id === user.id);
  const score = user.team_id ? r.score : user.rating;

  const myAtt = db.trainings
    .filter((t) => t.status !== 'cancelled' && participants(db, t).some((p) => p.id === user.id))
    .sort((a, b) => a.date.localeCompare(b.date));

  const togglePref = async (key: keyof NotifPrefs) => {
    try {
      await setMyNotif({ ...user.notif, [key]: !user.notif[key] });
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'שמירת ההגדרה נכשלה');
    }
  };

  return (
    <>
      <div className="hapak-profile">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <section className="card" style={{ padding: 16, gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={user.name} size={48} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="card-title" style={{ fontSize: 18 }}>
                  {user.rank} {user.name}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>{roleLabel(db, user)}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 12px', fontSize: 13 }}>
              <Muted>מספר אישי</Muted>
              <span className="tabnum">{user.pn || '—'}</span>
              <Muted>טלפון</Muted>
              <span className="tabnum">{user.phone || '—'}</span>
              <Muted>שיוך</Muted>
              <span>{user.team_id ? teamName(db, user.team_id) : 'מפקדה'}</span>
              <Muted>דירוג מפקד</Muted>
              <span className="tabnum">{user.rating}/10</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                כשירות אישית · {score.toFixed(1)}/10 · {r.note}
              </span>
              <ScoreBar score={score} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>הסמכות אישיות ותוקף</span>
              {CERT_TYPES.map(([k, label]) => {
                const s = certStatus(user, k, today, db.settings.cert_alert_days);
                return (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                    <span>{label}</span>
                    <span
                      className="tabnum"
                      style={{
                        color:
                          s === 'expired'
                            ? 'var(--color-accent-300)'
                            : s === 'soon'
                              ? 'var(--color-accent)'
                              : 'var(--color-neutral-400)',
                      }}
                    >
                      {user.certs[k] ? fmtFull(user.certs[k]!) : 'לא הוזן'}{' '}
                      {s === 'expired' ? 'פקעה' : s === 'soon' ? 'פוקעת בקרוב' : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            {user.is_instructor && user.qual.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>הסמכות הדרכה:</span>
                {user.qual.map((q) => (
                  <span key={q} className="tag tag-outline">
                    {topicName(db, q)}
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {perms.isAdmin && (
                <>
                  <button className="btn btn-secondary" onClick={() => setEditOpen(true)}>
                    עריכת פרטים
                  </button>
                  <button className="btn btn-secondary" onClick={() => setSettingsOpen(true)}>
                    הגדרות מערכת
                  </button>
                </>
              )}
              <button className="btn btn-ghost" onClick={() => void signOut().then(() => router.replace('/login'))}>
                יציאה
              </button>
            </div>
          </section>

          <SectionCard title="הגדרות התראות">
            {PREF_LABELS.map(([k, label]) => (
              <label
                key={k}
                style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', minHeight: 36 }}
              >
                <input type="checkbox" checked={!!user.notif[k]} onChange={() => void togglePref(k)} />
                {label}
                {k === 'evening' ? ` (${db.settings.evening_reminder})` : ''}
              </label>
            ))}
            <PushToggle />
            <Link
              href="/install"
              style={{ fontSize: 12.5, alignSelf: 'flex-start' }}
            >
              התקנת האפליקציה בטלפון (אייפון / גלקסי) →
            </Link>
          </SectionCard>

          <div className="hapak-mobile-links" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn btn-secondary" href="/logistics">
              לוגיסטיקה
            </Link>
            <Link className="btn btn-secondary" href="/archive">
              ארכיון
            </Link>
            <Link className="btn btn-secondary" href="/calendar">
              יומן מח״ט
            </Link>
            {perms.isAdmin && (
              <Link className="btn btn-secondary" href="/manage">
                ניהול התקופה
              </Link>
            )}
          </div>
        </div>

        <SectionCard title="הנוכחות שלי">
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>אימון</th>
                  <th>נושא</th>
                  <th>סטטוס</th>
                  <th>אישור</th>
                </tr>
              </thead>
              <tbody>
                {myAtt.map((t) => {
                  const a = t.attendance[user.id];
                  return (
                    <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/trainings/${t.id}`)}>
                      <td className="tabnum">{fmtShort(t.date)}</td>
                      <td>{trainingTitle(db, t)}</td>
                      <td>{topicName(db, t.topic_id)}</td>
                      <td>{a ? STATUS_LABEL[a.status] : t.date < today ? 'לא הגיב' : 'טרם סומן'}</td>
                      <td style={{ color: 'var(--color-accent-300)' }}>{a?.approved ? 'מאושר' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!myAtt.length && (
            <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>אין אימונים משויכים</span>
          )}
        </SectionCard>
      </div>

      <PersonDialog open={editOpen} person={user} onClose={() => setEditOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <style jsx>{`
        .hapak-profile {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 1000px) {
          .hapak-profile {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--color-neutral-500)' }}>{children}</span>;
}
