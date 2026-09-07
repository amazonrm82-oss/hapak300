'use client';

import { useEffect, useState } from 'react';
import { SectionCard } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/bits';
import { addDays, fmtFull, realToday } from '@/lib/core/dates';
import { backupJSON, downloadText, periodReportHTML, printHTML } from '@/lib/core/exports';
import { closePeriod } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';
import { supabase } from '@/lib/supabase/client';

/**
 * The period as something that ends.
 *
 * Until now `period_name` was simply overwritten, so the previous period's
 * attendance stopped being answerable the moment the next one began. Closing
 * one keeps its numbers as they were on the last day — computed once, in the
 * database — and opens the next.
 *
 * The backup sits here too, because both are the same worry: what survives.
 */
export function PeriodCard() {
  const { db, perms, toast, refresh } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [copies, setCopies] = useState<{ name: string; at: string }[]>([]);

  const isAdmin = perms.isAdmin;

  // the scheduled job writes these; only the leadership can list the bucket
  useEffect(() => {
    if (!isAdmin) return;
    void supabase()
      .storage.from('backups')
      .list('', { limit: 10, sortBy: { column: 'name', order: 'desc' } })
      .then(({ data }) =>
        setCopies(
          (data ?? [])
            .filter((f) => f.name.endsWith('.json'))
            .map((f) => ({ name: f.name, at: f.created_at ?? '' })),
        ),
      );
  }, [isAdmin]);

  if (!db || !perms.isAdmin) return null;

  const today = realToday();
  const s = db.settings;

  const openDialog = () => {
    setName('');
    setStart(addDays(today, 1));
    setNote('');
    setOpen(true);
  };

  const close = async () => {
    setBusy(true);
    try {
      await closePeriod(name, start, note);
      await refresh();
      toast(`תקופת ${s.period_name} נסגרה · נפתחה תקופת ${name.trim()}`);
      setOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'סגירת התקופה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const report = (from: string, to: string, title: string) => {
    if (!printHTML(s.app_name, periodReportHTML(db, from, to, title)))
      toast('הדפדפן חסם את חלון ההדפסה — אשר חלונות קופצים ונסה שוב');
  };

  return (
    <>
      <SectionCard
        title="תקופות, דו״חות וגיבוי"
        right={
          <button className="btn btn-secondary" style={{ fontSize: 12.5 }} onClick={openDialog}>
            סגירת תקופה
          </button>
        }
      >
        <span style={{ fontSize: 12.5, color: 'var(--color-neutral-400)', lineHeight: 1.6 }}>
          התקופה הפעילה: <b>{s.period_name}</b> · מ-{fmtFull(s.period_start)}. סגירת תקופה שומרת את
          הנוכחות והדירוגים כפי שהם ביום האחרון, ופותחת תקופה חדשה בלי לאבד את הקודמת.
        </span>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12.5 }}
            onClick={() => report(s.period_start, today, s.period_name)}
          >
            דו״ח כשירות לתקופה הנוכחית
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12.5 }}
            onClick={() => {
              downloadText(
                `hapak300-backup-${today}.json`,
                backupJSON(db),
                'application/json;charset=utf-8',
              );
              toast('הגיבוי ירד למכשיר — שמור אותו מחוץ למערכת');
            }}
          >
            גיבוי מלא (JSON)
          </button>
        </div>

        <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)', lineHeight: 1.6 }}>
          הגיבוי מכיל את כל היחידה — לוחמים, אימונים, נוכחות, לוגיסטיקה ותקופות שנסגרו. בסיס נתונים
          מתארח אינו גיבוי: מחיקה בטעות או פרויקט שנסגר לוקחים איתם הכול. שמור עותק מחוץ למערכת.
        </span>

        {copies.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
              גיבויים אוטומטיים (מדי שבוע, ארבעה אחרונים):
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {copies.map((c) => (
                <button
                  key={c.name}
                  className="btn btn-ghost tabnum"
                  style={{ fontSize: 12 }}
                  onClick={() =>
                    void supabase()
                      .storage.from('backups')
                      .createSignedUrl(c.name, 60)
                      .then(({ data, error }) => {
                        if (error || !data) return toast('הפקת הקישור נכשלה');
                        window.open(data.signedUrl, '_blank', 'noopener');
                      })
                  }
                >
                  ↓ {c.name.replace('hapak300-', '').replace('.json', '')}
                </button>
              ))}
            </div>
          </div>
        )}

        {db.periods.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 4 }}>
            <table className="table" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th>תקופה</th>
                  <th>מ־</th>
                  <th>עד</th>
                  <th>אימונים</th>
                  <th>לוחמים</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {db.periods.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="tabnum">{fmtFull(p.start_date)}</td>
                    <td className="tabnum">{fmtFull(p.end_date)}</td>
                    <td className="tabnum">{p.trainings}</td>
                    <td className="tabnum">{p.summary.length}</td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        onClick={() => report(p.start_date, p.end_date, p.name)}
                      >
                        דו״ח
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`סגירת תקופת ${s.period_name}`}
        body="הנוכחות, הדירוגים וההסמכות של התקופה נשמרים כפי שהם היום. האימונים והלוחמים נשארים במקומם — רק התקופה מתחלפת."
        width={520}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>
              ביטול
            </button>
            <button className="btn btn-primary" onClick={() => void close()} disabled={busy}>
              סגור ופתח תקופה חדשה
            </button>
          </>
        }
      >
        <Field label="שם התקופה החדשה">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: קיץ 2026"
          />
        </Field>
        <Field label="תחילת התקופה החדשה">
          <input
            className="input tabnum"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="הערה לסיכום (רשות)">
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="לדוגמה: תקופה מקוצרת בשל מבצע"
          />
        </Field>
        <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)', lineHeight: 1.6 }}>
          התקופה שנסגרת תסתיים ביום שלפני התאריך הזה, וכל היחידה תקבל על כך התראה.
        </span>
      </Dialog>
    </>
  );
}
