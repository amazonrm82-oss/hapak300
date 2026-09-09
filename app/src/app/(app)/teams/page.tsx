'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { KitDialog } from '@/components/dialogs/KitDialog';
import { useShareOrder } from '@/components/dialogs/TextDialog';
import { kitHTML, kitText, printHTML } from '@/lib/core/exports';
import { PersonDialog } from '@/components/dialogs/PersonDialog';
import { SettingsDialog } from '@/components/dialogs/SettingsDialog';
import { Avatar, EmptyState, Field, ScoreBar, SectionCard, Tag } from '@/components/ui/bits';
import { certAlerts } from '@/lib/core/alerts';
import { fmtShort } from '@/lib/core/dates';
import { RANK_FULL, RANKS } from '@/lib/core/constants';
import {
  canEditKitOf,
  canEditPerson,
  permsFor,
  roleLabel,
  rolesFor,
} from '@/lib/core/permissions';
import { readinessOf } from '@/lib/core/readiness';
import {
  absentOn,
  fullName,
  personById,
  rankSort,
  teamMembers,
  topicName,
} from '@/lib/core/selectors';
import type { Person, TeamKey } from '@/lib/core/types';
import { decideJoinRequest, quickAddPerson } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

/** Roster, quick add, certification alerts, join requests and the HQ staff. */
export default function TeamsPage() {
  const { db, user, today, toast, refresh } = useApp();
  const [editing, setEditing] = useState<Person | null | undefined>(undefined); // undefined = closed
  // the סמל צוות edits weapon, serial and certifications only, in a form of its own
  const [editingKit, setEditingKit] = useState<Person | null>(null);
  const [kitList, setKitList] = useState<{ text: string; html: string; scope: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [qa, setQa] = useState({
    name: '',
    rank: 'טוראי',
    role: 'מאבטח',
    pn: '',
    phone: '',
    team_id: 'a' as TeamKey,
  });

  // hooks before the early return, or the order changes between renders
  const { toWhatsApp, dialog: shareDialog } = useShareOrder(toast);

  if (!db || !user) return null;

  const perms = permsFor(db, user, null);
  const alerts = perms.seesStats ? certAlerts(db, today) : [];
  const joins = perms.canManagePeople ? db.join_requests.filter((j) => j.status === 'pending') : [];
  const staff = db.people.filter((p) => !p.team_id);
  const teamsEmpty = !db.people.some((p) => p.team_id);

  /**
   * The צל״ם list, offered both ways it gets sent: a message and a printable
   * page. One call site builds both, so the two can never disagree about who is
   * on the list.
   */
  const kitReport = (people: Person[], scope: string) => {
    const sorted = [...people].sort(rankSort);
    setKitList({ text: kitText(db, sorted, scope), html: kitHTML(db, sorted, scope), scope });
  };

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 26, margin: '0 0 4px' }}>צוותים</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-500)' }}>
            {perms.seesPN ? 'ממוין לפי דרגה · מספרים אישיים גלויים למפקדים בלבד' : 'ממוין לפי דרגה'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {perms.canKitReportAll && (
            <button
              className="btn btn-secondary"
              onClick={() => kitReport(db.people.filter((p) => p.status === 'active'), 'כל היחידה')}
            >
              דו״ח צל״ם — כל היחידה
            </button>
          )}
          {perms.canManagePeople && (
            <>
              <button className="btn btn-secondary" onClick={() => setSettingsOpen(true)}>
                שמות צוותים והגדרות
              </button>
              <button className="btn btn-primary" onClick={() => setEditing(null)}>
                + הוספת לוחם
              </button>
            </>
          )}
        </div>
      </div>

      {perms.canManagePeople && (
        <SectionCard
          title="הוספה מהירה של לוחם"
          right={
            <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
              הלוחם ייכנס עם המספר האישי ויבחר קוד בכניסה הראשונה · הרשאות והסמכות בטופס המלא (״עריכה״)
            </span>
          }
        >
          {teamsEmpty && (
            <span style={{ fontSize: 13, color: 'var(--color-accent-300)' }}>
              הצוותים ריקים — הוסף את הלוחמים ומנה מפקד צוות לכל צוות (בטופס העריכה).
            </span>
          )}
          <div className="hapak-quickadd">
            <Field label="שם מלא">
              <input
                className="input"
                value={qa.name}
                onChange={(e) => setQa((s) => ({ ...s, name: e.target.value }))}
                style={{ minHeight: 34 }}
              />
            </Field>
            <Field label="דרגה">
              <select
                className="input"
                value={qa.rank}
                onChange={(e) => setQa((s) => ({ ...s, rank: e.target.value }))}
                style={{ minHeight: 34 }}
              >
                {RANKS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  {RANK_FULL[r] ? ` · ${RANK_FULL[r]}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="תפקיד">
              <select
                className="input"
                value={qa.role}
                onChange={(e) => setQa((s) => ({ ...s, role: e.target.value }))}
                style={{ minHeight: 34 }}
              >
                {rolesFor(user).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="מספר אישי">
              <input
                className="input tabnum"
                inputMode="numeric"
                maxLength={7}
                value={qa.pn}
                onChange={(e) => setQa((s) => ({ ...s, pn: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                style={{ minHeight: 34 }}
              />
            </Field>
            <Field label="טלפון">
              <input
                className="input"
                value={qa.phone}
                onChange={(e) => setQa((s) => ({ ...s, phone: e.target.value }))}
                placeholder="050-0000000"
                style={{ minHeight: 34 }}
              />
            </Field>
            <Field label="צוות">
              <select
                className="input"
                value={qa.team_id}
                onChange={(e) => setQa((s) => ({ ...s, team_id: e.target.value as TeamKey }))}
                style={{ minHeight: 34 }}
              >
                <option value="a">{db.teams.a.name}</option>
                <option value="b">{db.teams.b.name}</option>
                <option value="c">{db.teams.c.name}</option>
              </select>
            </Field>
            <button
              className="btn btn-primary"
              style={{ minHeight: 34, whiteSpace: 'nowrap' }}
              onClick={() =>
                void run(async () => {
                  await quickAddPerson(db, qa);
                  setQa((s) => ({ ...s, name: '', pn: '', phone: '' }));
                }, `${qa.rank} ${qa.name} נוסף — ייכנס עם המספר האישי ויבחר קוד`)
              }
            >
              הוסף
            </button>
          </div>
        </SectionCard>
      )}

      {alerts.length > 0 && (
        <section
          className="card"
          style={{ padding: '12px 16px', gap: 6, boxShadow: '0 0 0 1px var(--color-accent-800)' }}
        >
          <span className="card-title" style={{ fontSize: 14 }}>
            הסמכות שפקעו או פוקעות ב-{db.settings.cert_alert_days} הימים הקרובים
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {alerts.map((a, i) => (
              <span key={i} style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag kind={a.status === 'expired' ? 'accent' : 'outline'} style={{ fontSize: 10.5 }}>
                  {a.status === 'expired' ? 'פקעה' : 'פוקעת בקרוב'}
                </Tag>
                {a.text}
              </span>
            ))}
          </div>
        </section>
      )}

      {joins.map((j) => (
        <div
          key={j.id}
          className="card"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            boxShadow: '0 0 0 1px var(--color-accent-700)',
            flexWrap: 'wrap',
          }}
        >
          <Tag kind="accent">בקשת הצטרפות</Tag>
          <span style={{ fontSize: 13, flex: 1, minWidth: 240 }}>
            {j.rank} {j.name} · {j.role} · מ.א. {j.pn} · {j.phone || 'ללא טלפון'} · מבקש ל
            {db.teams[j.team_id].name}
          </span>
          <button
            className="btn btn-primary"
            onClick={() => void run(() => decideJoinRequest(j.id, true), `${j.rank} ${j.name} נוסף לצוות`)}
          >
            אשר והוסף
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => void run(() => decideJoinRequest(j.id, false), 'הבקשה נדחתה')}
          >
            דחה
          </button>
        </div>
      ))}

      <div className="hapak-teams-grid">
        {(['a', 'b', 'c'] as TeamKey[]).map((tm) => {
          const members = teamMembers(db, tm);
          const activeCount = members.filter((p) => p.status === 'active').length;
          const r = readinessOf(db, (p) => p.team_id === tm);
          const cmd = personById(db, db.teams[tm].commander_id);
          return (
            <section key={tm} className="card" style={{ padding: '14px 16px', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="card-title" style={{ fontSize: 18 }}>
                    {db.teams[tm].name}
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>
                    {cmd ? `מפקד: ${fullName(cmd)}` : 'טרם מונה מפקד'} ·{' '}
                    {activeCount === 1 ? 'לוחם פעיל אחד' : `${activeCount} פעילים`} · {members.length} סה״כ
                  </span>
                </div>
                {perms.canKitReport && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                    onClick={() => kitReport(members.filter((p) => p.status === 'active'), db.teams[tm].name)}
                  >
                    דו״ח צל״ם
                  </button>
                )}
                {perms.seesStats && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className="tabnum" style={{ fontSize: 20 }}>
                      {r.score.toFixed(1)}
                      <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}> /10</span>
                    </span>
                    <div style={{ width: 130 }}>
                      <ScoreBar score={r.score} cell={5} />
                    </div>
                    <span style={{ fontSize: 10.5, color: 'var(--color-neutral-500)' }}>{r.note}</span>
                  </div>
                )}
              </div>

              {!members.length && (
                <EmptyState
                  title="הצוות ריק"
                  sub={
                    perms.canManagePeople
                      ? 'השתמש בטופס ההוספה המהירה למעלה כדי להזין את הלוחמים.'
                      : 'מנהל המערכת עדיין לא הזין לוחמים לצוות זה.'
                  }
                />
              )}

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {members.map((p) => {
                  const pr = perms.seesStats ? readinessOf(db, (x) => x.id === p.id).score.toFixed(1) : '';
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '32px minmax(0,1fr) auto',
                        gap: 10,
                        alignItems: 'center',
                        padding: '7px 0',
                        borderBottom: '1px solid var(--color-neutral-900)',
                      }}
                    >
                      <Avatar name={p.name} />
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span
                          style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                        >
                          {fullName(p)}
                          {p.is_team_commander && (
                            <Tag kind="accent" style={{ fontSize: 10, padding: '1px 6px' }}>
                              מפקד צוות
                            </Tag>
                          )}
                          {p.is_instructor && (
                            <Tag
                              kind="outline"
                              style={{ fontSize: 10, padding: '1px 6px' }}
                            >
                              מדריך
                            </Tag>
                          )}
                          {p.status !== 'active' && (
                            <Tag style={{ fontSize: 10, padding: '1px 6px' }}>
                              מושבת{p.status_note ? ` · ${p.status_note}` : ''}
                            </Tag>
                          )}
                          {/* a spell that has not started yet is worth seeing too —
                              it is what a commander plans the next training around */}
                          {absentOn(p, today) && (
                            <Tag style={{ fontSize: 10, padding: '1px 6px' }}>
                              בהיעדרות{p.absent_to ? ` עד ${fmtShort(p.absent_to)}` : ''}
                            </Tag>
                          )}
                          {!absentOn(p, today) && p.absent_from && p.absent_from > today && (
                            <Tag style={{ fontSize: 10, padding: '1px 6px' }}>
                              היעדרות מ-{fmtShort(p.absent_from)}
                            </Tag>
                          )}
                          {p.id === user.id && (
                            <span style={{ fontSize: 10.5, color: 'var(--color-neutral-500)' }}>(אני)</span>
                          )}
                        </span>
                        <span className="tabnum" style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                          {p.role}
                          {perms.seesPN && p.pn ? ` · מ.א. ${p.pn}` : ''}
                          {p.phone ? ` · ${p.phone}` : ''}
                          {p.is_instructor && p.qual.length
                            ? ` · מדריך: ${p.qual.map((q) => topicName(db, q)).join(', ')}`
                            : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {perms.seesStats && (
                          <span className="tabnum" style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>
                            {pr}
                          </span>
                        )}
                        {(canEditPerson(user, p) || canEditKitOf(db, user, p)) && (
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: 12 }}
                            onClick={() => (canEditPerson(user, p) ? setEditing(p) : setEditingKit(p))}
                          >
                            {canEditPerson(user, p) ? 'עריכה' : 'נשק והכשרות'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <SectionCard title="מפקדה">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {staff.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={p.name} size={30} />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 13 }}>{fullName(p)}</span>
                <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>{roleLabel(db, p)}</span>
              </span>
              {(canEditPerson(user, p) || canEditKitOf(db, user, p)) && (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => (canEditPerson(user, p) ? setEditing(p) : setEditingKit(p))}
                >
                  {canEditPerson(user, p) ? 'עריכה' : 'נשק והכשרות'}
                </button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {kitList && (
        <Dialog
          open
          onClose={() => setKitList(null)}
          width={560}
          title={`דו״ח צל״ם · ${kitList.scope}`}
          body="סוג נשק ומספרו, סוג אמר״ל ומספרו — לכל לוחם. מי שחסר לו פרט מסומן בדו״ח."
          actions={
            <>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const ok = printHTML(db.settings.app_name, kitList.html);
                  toast(ok ? 'נפתח חלון הדפסה — שמור כ-PDF' : 'הדפדפן חסם את חלון ההדפסה');
                }}
              >
                PDF להורדה
              </button>
              <button
                className="btn btn-primary"
                onClick={() => toWhatsApp(kitList.text, 'דו״ח הצל״ם')}
              >
                שליחה בוואטסאפ
              </button>
            </>
          }
        >
          <textarea
            className="input"
            rows={12}
            readOnly
            value={kitList.text}
            style={{ fontSize: 12.5, lineHeight: 1.5 }}
          />
        </Dialog>
      )}

      {shareDialog}

      <KitDialog
        open={!!editingKit}
        person={editingKit}
        onClose={() => setEditingKit(null)}
      />

      <PersonDialog
        open={editing !== undefined}
        person={editing ?? null}
        onClose={() => setEditing(undefined)}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <style jsx>{`
        .hapak-quickadd {
          display: grid;
          grid-template-columns: minmax(160px, 1.4fr) 110px 130px 130px 150px 130px auto;
          gap: 8px;
          align-items: end;
        }
        .hapak-teams-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 1000px) {
          .hapak-quickadd {
            grid-template-columns: 1fr 1fr;
          }
          .hapak-teams-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </>
  );
}
