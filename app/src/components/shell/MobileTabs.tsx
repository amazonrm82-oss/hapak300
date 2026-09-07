'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { upcomingFor } from '@/lib/core/selectors';
import { useApp } from '@/lib/data/provider';

/** The five tabs the unit picked for the phone: לו״ז · האימון שלי · צ׳אט · הצוות · פרופיל */
const TABS: [string, string][] = [
  ['/schedule', 'לו״ז'],
  ['/my', 'האימון שלי'],
  ['/chat', 'צ׳אט'],
  ['/teams', 'הצוות'],
  ['/profile', 'פרופיל'],
];

export function MobileTabs() {
  const pathname = usePathname();
  const { db, user, today } = useApp();

  // unread messages on the next training show as a badge on the chat tab
  let unread = 0;
  if (db && user) {
    const next = upcomingFor(db, user, today)[0];
    if (next) unread = next.chat.filter((m) => !m.read_by.includes(user.id)).length;
  }

  return (
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
      <style jsx>{`
        @media (min-width: 768px) {
          .hapak-tabs {
            display: none !important;
          }
        }
      `}</style>
    </nav>
  );
}
