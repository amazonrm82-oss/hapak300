'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { upcomingFor } from '@/lib/core/selectors';
import { useApp } from '@/lib/data/provider';

/** The four the unit reaches for daily, and everything else behind ״עוד״. */
const TABS: [string, string][] = [
  ['/schedule', 'לו״ז'],
  ['/my', 'האימון שלי'],
  ['/chat', 'צ׳אט'],
  ['/teams', 'הצוות'],
];

/**
 * The rest of the app, as it is on a computer.
 *
 * Five tabs cover the day, but the phone is the only screen most of the unit
 * has — a commander looking at logistics or the brigade calendar should not
 * have to find a laptop.
 */
const MORE: [string, string, string][] = [
  ['/trainings', 'אימונים', 'כל האימונים בתקופה, כולל שהסתיימו'],
  ['/logistics', 'לוגיסטיקה', 'ציוד, רכבים, תחמושת ומזון'],
  ['/calendar', 'יומן מח״ט', 'אירועי החטיבה וחגים'],
  ['/archive', 'ארכיון', 'אימונים שהסתיימו ודו״חות'],
  ['/profile', 'פרופיל', 'הפרטים שלי, קוד וכניסה'],
  ['/install', 'התקנה והתראות', 'התקנת האפליקציה והתראות לפלאפון'],
];

export function MobileTabs() {
  const pathname = usePathname();
  const { db, user, today, perms } = useApp();
  const [more, setMore] = useState(false);

  // unread messages on the next training show as a badge on the chat tab
  let unread = 0;
  if (db && user) {
    const next = upcomingFor(db, user, today)[0];
    if (next) unread = next.chat.filter((m) => !m.read_by.includes(user.id)).length;
  }

  const moreItems: [string, string, string][] = [
    ...MORE,
    ...(perms.canManagePeriod
      ? ([['/manage', 'ניהול', 'תקופות, תבנית סבב, גיבוי ויומן פעולות']] as [string, string, string][])
      : []),
  ];
  const onMore = moreItems.some(([href]) => pathname === href || pathname.startsWith(`${href}/`));

  return (
    <>
      {more && (
        <Dialog open sheet onClose={() => setMore(false)} title="כל המסכים">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {moreItems.map(([href, label, sub]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMore(false)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  padding: '11px 4px',
                  borderBottom: '1px solid var(--color-neutral-900)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span style={{ fontSize: 14.5 }}>{label}</span>
                <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>{sub}</span>
              </Link>
            ))}
          </div>
        </Dialog>
      )}

    <nav
      className="hapak-tabs"
      aria-label="ניווט ראשי"
      style={{
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        zIndex: 25,
        background: 'var(--hapak-chrome)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderTop: '1px solid var(--color-divider)',
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        padding: '6px 6px calc(6px + env(safe-area-inset-bottom))',
      }}
    >
      {TABS.map(([href, label]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '6px 2px',
              minHeight: 48,
              justifyContent: 'center',
              textDecoration: 'none',
              color: active ? 'var(--color-accent)' : 'var(--color-neutral-400)',
            }}
          >
            <span
              style={{
                width: 22,
                height: 3,
                borderRadius: 2,
                background: active ? 'var(--color-accent)' : 'transparent',
              }}
            />
            <span style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{label}</span>
            {href === '/chat' && unread > 0 ? (
              <span style={{ fontSize: 10, color: 'var(--color-accent)' }}>{unread}</span>
            ) : null}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setMore(true)}
        aria-label="כל המסכים"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          padding: '6px 2px',
          minHeight: 48,
          justifyContent: 'center',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: onMore ? 'var(--color-accent)' : 'var(--color-neutral-400)',
        }}
      >
        <span
          style={{
            width: 22,
            height: 3,
            borderRadius: 2,
            background: onMore ? 'var(--color-accent)' : 'transparent',
          }}
        />
        <span style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>עוד</span>
      </button>
      <style jsx>{`
        @media (min-width: 768px) {
          .hapak-tabs {
            display: none !important;
          }
        }
      `}</style>
    </nav>
    </>
  );
}
