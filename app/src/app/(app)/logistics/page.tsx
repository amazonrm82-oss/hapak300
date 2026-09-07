'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SectionCard, Tag } from '@/components/ui/bits';
import { dayLetter, fmtShort } from '@/lib/core/dates';
import { permsFor } from '@/lib/core/permissions';
import { activeTrainings, topicName, trainingTitle } from '@/lib/core/selectors';
import { addCatalogItem, removeCatalogItem } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

/** Logistics across all upcoming trainings, plus the unit's catalogs. */
export default function LogisticsPage() {
  const { db, user, toast, refresh } = useApp();
  const router = useRouter();
  const [draft, setDraft] = useState({ gear_catalog: '', vehicle_types: '', locations: '' });

  if (!db || !user) return null;

  const perms = permsFor(db, user, null);
  const canCat = perms.isAdmin || user.is_team_commander;
  const rows = activeTrainings(db);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      await refresh();
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה');
    }
  };

  const catalogs: [keyof typeof draft, string, string[]][] = [
    ['gear_catalog', 'מאגר ציוד לוגיסטי', db.gear_catalog],
    ['vehicle_types', 'סוגי רכבים', db.vehicle_types],
    ['locations', 'מיקומי אימון', db.locations],
  ];

  return (
    <>
      <div>
        <h2 style={{ fontSize: 26, margin: '0 0 4px' }}>לוגיסטיקה</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-500)' }}>
          מבט על לכל האימונים הקרובים · מפקד האימון מנהל את הלוגיסטיקה של האימון שלו
        </p>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>אימון</th>
              <th>נושא</th>
              <th>מועד</th>
              <th>ציוד</th>
              <th>רכבים</th>
              <th>תחמושת</th>
              <th>מזון ושתייה</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const veh: Record<string, number> = {};
              t.vehicles.forEach((v) => {
                veh[v.type] = (veh[v.type] || 0) + 1;
              });
              const ammo = t.ammo.reduce((s, a) => s + a.allocated, 0);
              return (
                <tr
                  key={t.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/trainings/${t.id}?tab=logistics`)}
                >
                  <td>{trainingTitle(db, t)}</td>
                  <td>{topicName(db, t.topic_id)}</td>
                  <td className="tabnum">
                    {dayLetter(t.date)} {fmtShort(t.date)}
                  </td>
                  <td style={{ color: 'var(--color-neutral-400)' }}>
                    {t.gear.length} פריטים · {t.gear.reduce((s, g) => s + g.qty, 0)} יח׳
                  </td>
                  <td style={{ color: 'var(--color-neutral-400)' }}>
                    {Object.entries(veh)
                      .map(([k, n]) => `${k} ×${n}`)
                      .join(' · ') || '—'}
                  </td>
                  <td className="tabnum">
                    {ammo ? `${ammo.toLocaleString('en-US')} כד׳` : '—'}{' '}
                    <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
                      {t.ammo_signed ? 'חתום' : ammo ? 'ממתין' : ''}
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-neutral-400)', fontSize: 12.5 }}>
                    {t.food.map((f) => `${f.name} ${f.qty}`).join(' · ')}
                  </td>
                  <td>
                    <button className="btn btn-ghost">פתח</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!rows.length && (
        <span style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
          אין אימונים קרובים — הלוגיסטיקה נוצרת אוטומטית לכל אימון חדש לפי הנושא.
        </span>
      )}

      <div className="hapak-catalogs">
        {catalogs.map(([key, title, list]) => (
          <SectionCard key={key} title={title}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {list.map((name) => (
                <Tag key={name} style={{ gap: 6 }}>
                  {name}
                  {canCat && (
                    <button
                      onClick={() => void run(() => removeCatalogItem(key, name))}
                      aria-label={`הסר ${name}`}
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: 'var(--color-neutral-400)',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 12,
                        lineHeight: 1,
                        fontFamily: 'inherit',
                      }}
                    >
                      ×
                    </button>
                  )}
                </Tag>
              ))}
              {!list.length && (
                <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>המאגר ריק</span>
              )}
            </div>
            {canCat && (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="input"
                  placeholder="הוספה למאגר"
                  value={draft[key]}
                  onChange={(e) => setDraft((s) => ({ ...s, [key]: e.target.value }))}
                  style={{ minHeight: 32 }}
                />
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    void run(async () => {
                      await addCatalogItem(key, draft[key]);
                      setDraft((s) => ({ ...s, [key]: '' }));
                    })
                  }
                >
                  הוסף
                </button>
              </div>
            )}
          </SectionCard>
        ))}
      </div>

      <style jsx>{`
        .hapak-catalogs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .hapak-catalogs {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </>
  );
}
