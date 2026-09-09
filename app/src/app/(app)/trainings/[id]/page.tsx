'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AttendanceDialog } from '@/components/dialogs/AttendanceDialog';
import { InviteDialog } from '@/components/dialogs/InviteDialog';
import { TrainingFormDialog } from '@/components/dialogs/TrainingFormDialog';
import { useShareOrder } from '@/components/dialogs/TextDialog';
import { AttendanceTab } from '@/components/training/AttendanceTab';
import { ChatTab } from '@/components/training/ChatTab';
import { LogisticsTab } from '@/components/training/LogisticsTab';
import { OverviewTab } from '@/components/training/OverviewTab';
import { DrillsTab } from '@/components/training/DrillsTab';
import { SummaryTab } from '@/components/training/SummaryTab';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Field, Tag } from '@/components/ui/bits';
import { TRAINING_STATUS } from '@/lib/core/constants';
import { dateLine, pad, weekOf } from '@/lib/core/dates';
import {
  attendanceCSV,
  ammoHTML,
  ammoText,
  attendanceHTML,
  downloadText,
  orderHTML,
  orderText,
  printHTML,
} from '@/lib/core/exports';
import { permsFor, canMarkAttendance } from '@/lib/core/permissions';
import {
  attendanceStats,
  byId,
  isPendingSummary,
  participants,
  topicName,
  trainingCode,
  trainingTitle,
} from '@/lib/core/selectors';
import type { InviteRole, TrainingFull } from '@/lib/core/types';
import {
  cancelTraining,
  deleteTraining,
  duplicateTraining,
  markChatRead,
  postponeTraining,
} from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

type Tab = 'overview' | 'attendance' | 'drills' | 'logistics' | 'chat' | 'summary';

export default function TrainingPage({ params }: { params: { id: string } }) {
  const app = useApp();
  const { db, user, today, toast, refresh } = app;
  const router = useRouter();
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>((search.get('tab') as Tab) || 'overview');
  const [markPerson, setMarkPerson] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<InviteRole | null>(null);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { share, toWhatsApp, dialog: shareDialog } = useShareOrder(toast);

  const t = db ? (byId(db.trainings, params.id) as TrainingFull | null) : null;

  useEffect(() => {
    if (tab === 'chat' && t) void markChatRead(t.id);
  }, [tab, t]);

  if (!db || !user) return null;
  if (!t)
    return (
      <div className="card" style={{ padding: 20, gap: 10 }}>
        <span className="card-title">האימון לא נמצא</span>
        <button className="btn btn-secondary" onClick={() => router.push('/trainings')}>
          ‹ כל האימונים
        </button>
      </div>
    );

  const perms = permsFor(db, user, t);
  const st = attendanceStats(db, t);
  const isLive = t.status !== 'done' && t.status !== 'cancelled';
  const isPart = participants(db, t).some((p) => p.id === user.id);
  const mine = t.attendance[user.id];
  const canMark = isPart && canMarkAttendance(db, user, t, user.id, today);
  const unreadChat = t.chat.filter((m) => !m.read_by.includes(user.id)).length;

  const tabs: [Tab, string][] = [
    ['overview', 'סקירה'],
    ['attendance', `נוכחות ${st.responded}/${st.total}`],
    ['drills', t.drills.length ? `מקצים (${t.drills.length})` : 'מקצים'],
    ['logistics', 'לוגיסטיקה ותחמושת'],
    ['chat', unreadChat ? `צ׳אט (${unreadChat})` : 'צ׳אט'],
    ['summary', 'סיכום'],
  ];

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            className="btn btn-ghost"
            onClick={() => router.push('/trainings')}
            style={{ alignSelf: 'flex-start', paddingInline: 0, whiteSpace: 'nowrap' }}
          >
            ‹ כל האימונים
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--color-accent)' }}>
              שבוע {pad(weekOf(db.settings.period_start, t.date))} · {trainingTitle(db, t)}
            </span>
            <Tag kind={t.status === 'cancelled' ? 'outline' : t.team_id === 'joint' || t.status === 'done' ? 'accent' : 'neutral'}>
              {TRAINING_STATUS[t.status]}
            </Tag>
            {isPendingSummary(t, today) && <Tag kind="accent">ממתין לסיכום</Tag>}
          </div>
          <h2 style={{ fontSize: 28, margin: 0 }}>{topicName(db, t.topic_id)}</h2>
          <span className="tabnum" style={{ fontSize: 13.5, color: 'var(--color-neutral-400)' }}>
            {dateLine(t)} · {t.location}
            {t.coords ? ` · נצ״ד ${t.coords}` : ''}
          </span>
          {t.status === 'cancelled' && (
            <span style={{ fontSize: 13, color: 'var(--color-accent-300)' }}>בוטל: {t.cancel_reason}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {canMark && (
            <button className="btn btn-primary" onClick={() => setMarking(true)} style={{ whiteSpace: 'nowrap' }}>
              {mine ? 'עדכון נוכחות' : 'סימון נוכחות'}
            </button>
          )}
          {perms.canEdit && isLive && (
            <>
              <button className="btn btn-secondary" onClick={() => setEditOpen(true)}>
                עריכה
              </button>
              <button className="btn btn-secondary" onClick={() => setPostponeOpen(true)}>
                דחייה
              </button>
              <button className="btn btn-secondary" onClick={() => setCancelOpen(true)}>
                ביטול
              </button>
            </>
          )}
          {/* the same day again, on another date: the kit, the schedule and the
              stations come across — only the results and the drivers do not */}
          {perms.canCreate && (
            <button
              className="btn btn-secondary"
              onClick={() => setCopyOpen(true)}
              style={{ whiteSpace: 'nowrap' }}
            >
              שכפול אימון
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => share(orderText(db, t))} style={{ whiteSpace: 'nowrap' }}>
            שיתוף פקודת אימון
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              const ok = printHTML(db.settings.app_name, orderHTML(db, t));
              toast(ok ? 'נפתח חלון הדפסה — שמור כ-PDF' : 'הדפדפן חסם את חלון ההדפסה');
            }}
            style={{ whiteSpace: 'nowrap' }}
          >
            פקודה PDF
          </button>
          {perms.canEdit && (
            <button
              className="btn btn-ghost"
              onClick={() =>
                void run(async () => {
                  const id = await duplicateTraining(db, t);
                  if (id) router.push(`/trainings/${id}`);
                }, 'נוצר עותק — מדריך ומפקד אימון ממתינים לאישור')
              }
              style={{ whiteSpace: 'nowrap' }}
            >
              {t.team_id === 'joint' ? 'שכפול לשבוע הבא' : 'שכפול לצוות השני (+7)'}
            </button>
          )}
          {perms.canDeleteTraining && (
            <button className="btn btn-ghost" onClick={() => setDeleteOpen(true)}>
              מחיקה
            </button>
          )}
          {perms.canExport && (
            <>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const ok = printHTML(db.settings.app_name, attendanceHTML(db, t));
                  toast(ok ? 'נפתח חלון הדפסה — שמור כ-PDF' : 'הדפדפן חסם את חלון ההדפסה');
                }}
                style={{ whiteSpace: 'nowrap' }}
              >
                דוח נוכחות PDF
              </button>
              {/* what the day actually fired, totalled from the stations */}
              <button
                className="btn btn-ghost"
                onClick={() => toWhatsApp(ammoText(db, t), 'דו״ח התחמושת')}
                style={{ whiteSpace: 'nowrap' }}
              >
                תחמושת לוואטסאפ
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const ok = printHTML(db.settings.app_name, ammoHTML(db, t));
                  toast(ok ? 'נפתח חלון הדפסה — שמור כ-PDF' : 'הדפדפן חסם את חלון ההדפסה');
                }}
                style={{ whiteSpace: 'nowrap' }}
              >
                דו״ח תחמושת PDF
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  downloadText(`נוכחות-${trainingCode(t)}-${t.date}.csv`, attendanceCSV(db, t));
                  toast('קובץ אקסל (CSV) ירד למחשב');
                }}
                style={{ whiteSpace: 'nowrap' }}
              >
                ייצוא לאקסל
              </button>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--color-divider)',
          paddingBottom: 6,
          flexWrap: 'wrap',
          overflowX: 'auto',
        }}
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={`btn ${tab === id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(id)}
            style={{ whiteSpace: 'nowrap' }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab training={t} onInvite={setInviteRole} onOpenAttendance={() => setMarking(true)} />
      )}
      {tab === 'attendance' && (
        <AttendanceTab training={t} onEditPerson={(pid) => setMarkPerson(pid)} />
      )}
      {tab === 'logistics' && <LogisticsTab training={t} />}
      {tab === 'chat' && <ChatTab training={t} />}
      {tab === 'drills' && <DrillsTab training={t} />}
      {tab === 'summary' && <SummaryTab training={t} />}

      {(marking || markPerson) && (
        <AttendanceDialog
          training={t}
          personId={markPerson}
          onClose={() => {
            setMarking(false);
            setMarkPerson(null);
          }}
        />
      )}

      <TrainingFormDialog open={editOpen} training={t} onClose={() => setEditOpen(false)} />
      <TrainingFormDialog
        open={copyOpen}
        training={null}
        duplicateOf={t}
        onClose={() => setCopyOpen(false)}
      />
      <InviteDialog training={inviteRole ? t : null} role={inviteRole} onClose={() => setInviteRole(null)} />

      <PostponeDialog
        open={postponeOpen}
        training={t}
        onClose={() => setPostponeOpen(false)}
        onSave={(d, s, e) =>
          void run(
            () => postponeTraining(t.id, d, s, e),
            'האימון נדחה, הנוכחות אופסה והצוות קיבל התראה',
          ).then(() => setPostponeOpen(false))
        }
      />

      <CancelDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onSave={(reason) =>
          void run(() => cancelTraining(t.id, reason), 'האימון בוטל ונשמר בארכיון').then(() => {
            setCancelOpen(false);
            router.push('/archive');
          })
        }
      />

      <ConfirmDialog
        open={deleteOpen}
        title={`למחוק לצמיתות את ${trainingTitle(db, t)} · ${topicName(db, t.topic_id)}?`}
        body="המחיקה סופית ואינה נשמרת בארכיון. כדי לבטל אימון ולשמור אותו בארכיון — השתמש ב״ביטול״."
        confirmLabel="מחק לצמיתות"
        onClose={() => setDeleteOpen(false)}
        onConfirm={() =>
          void run(() => deleteTraining(t.id), 'האימון נמחק לצמיתות').then(() => {
            setDeleteOpen(false);
            router.push('/manage');
          })
        }
      />

      {shareDialog}
    </>
  );
}

function PostponeDialog({
  open,
  training,
  onClose,
  onSave,
}: {
  open: boolean;
  training: TrainingFull;
  onClose: () => void;
  onSave: (date: string, start: string, end: string) => void;
}) {
  const [date, setDate] = useState(training.date);
  const [start, setStart] = useState(training.start);
  const [end, setEnd] = useState(training.end);

  useEffect(() => {
    if (open) {
      setDate(training.date);
      setStart(training.start);
      setEnd(training.end);
    }
  }, [open, training]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="דחיית אימון"
      body="הנוכחות שסומנה תאופס וכל הצוות יקבל התראה."
      width={560}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button className="btn btn-primary" onClick={() => onSave(date, start, end)}>
            דחה ועדכן את הצוות
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label="תאריך חדש">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="התחלה">
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="סיום">
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="ביטול אימון"
      body="האימון יישמר בארכיון כ״בוטל״ וכל הצוות יקבל התראה."
      width={560}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            חזרה
          </button>
          <button className="btn btn-primary" onClick={() => onSave(reason)}>
            בטל אימון
          </button>
        </>
      }
    >
      <Field label="סיבת הביטול">
        <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Dialog>
  );
}
