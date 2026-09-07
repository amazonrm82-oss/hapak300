'use client';

import { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '@/components/ui/bits';
import { supabase } from '@/lib/supabase/client';
import { useApp } from '@/lib/data/provider';

interface Entry {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity: string;
  subject: string;
  detail: string;
}

const ENTITY: Record<string, string> = {
  people: 'לוחם',
  trainings: 'אימון',
  settings: 'הגדרות',
  fleet: 'רכב',
};

/**
 * Who changed what, and when.
 *
 * Written by database triggers rather than by the app, so it records what
 * actually happened rather than what a screen believed it was doing — and
 * nobody, including an administrator, can edit or delete a line of it. Read by
 * the leadership only; the policy is what enforces that, not this component.
 */
export function AuditLog() {
  const { perms } = useApp();
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    const { data, error: e } = await supabase()
      .from('audit_log')
      .select('id, at, actor, action, entity, subject, detail')
      .order('at', { ascending: false })
      .limit(200);
    if (e) setError(e.message);
    setRows((data ?? []) as Entry[]);
  }, []);

  useEffect(() => {
    if (perms.isAdmin) void load();
  }, [perms.isAdmin, load]);

  if (!perms.isAdmin) return null;

  const shown = (rows ?? []).filter((r) => {
    if (!filter) return true;
    const hay = `${r.actor} ${r.subject} ${r.detail} ${ENTITY[r.entity] ?? r.entity}`;
    return hay.includes(filter);
  });

  return (
    <SectionCard
      title="יומן פעולות"
      right={
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => void load()}>
          רענן
        </button>
      }
    >
      <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
        מי הוסיף, מי שינה הרשאה, מי אישר נוכחות, מי איפס קוד. נכתב בבסיס הנתונים ואי אפשר לערוך או
        למחוק ממנו — גם לא מנהל מערכת. 200 הפעולות האחרונות.
      </span>

      <input
        className="input"
        placeholder="סינון לפי שם, פעולה או לוחם"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ minHeight: 34 }}
      />

      {error && (
        <span style={{ fontSize: 12.5, color: 'var(--color-accent-300)' }}>
          קריאת היומן נכשלה: {error}
        </span>
      )}

      {rows === null && !error && (
        <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>טוען…</span>
      )}

      {rows !== null && !shown.length && (
        <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>
          {filter ? 'אין תוצאות לסינון הזה' : 'היומן ריק'}
        </span>
      )}

      {shown.length > 0 && (
        <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
          <table className="table" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th>מתי</th>
                <th>מי</th>
                <th>פעולה</th>
                <th>על מה</th>
                <th>פירוט</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="tabnum" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    {new Date(r.at).toLocaleString('he-IL', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{r.actor}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {r.action} {ENTITY[r.entity] ?? r.entity}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{r.subject}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
