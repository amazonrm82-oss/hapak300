'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/bits';
import { dayLetter, fmtFull } from '@/lib/core/dates';
import { roleLabel } from '@/lib/core/permissions';
import { fullName, notifsFor } from '@/lib/core/selectors';
import { markNotificationsRead } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

const NAV: [string, string][] = [
  ['/schedule', 'לו״ז'],
  ['/trainings', 'אימונים'],
  ['/teams', 'צוותים'],
  ['/logistics', 'לוגיסטיקה'],
  ['/calendar', 'יומן מח״ט'],
  ['/archive', 'ארכיון'],
];

export function AppHeader() {
  const { db, user, perms, today, now, signOut, refresh } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrap = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setMenuOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setNotifOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  if (!db || !user) return null;

  const nav = [...NAV, ...(perms.isAdmin ? ([['/manage', 'ניהול']] as [string, string][]) : [])];
  const notifs = notifsFor(db, user).slice(0, 14);
  const unread = notifsFor(db, user).filter((n) => !n.read).length;

  return (
    <header
      ref={wrap}
      className="nav hapak-header"
      style={{
        padding: '8px 20px',
        gap: '14px 20px',
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'var(--hapak-chrome)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--color-divider)',
        flexWrap: 'wrap',
      }}
    >
      <Link
        href="/schedule"
        style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}
      >
        <Image src="/emblem.png" alt="" width={34} height={34} style={{ height: 34, width: 'auto' }} />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span className="nav-brand" style={{ margin: 0, fontSize: 16, whiteSpace: 'nowrap' }}>
            {db.settings.app_name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-neutral-500)', whiteSpace: 'nowrap' }}>
            תוכנית אימונים · {db.settings.period_name}
          </span>
        </span>
      </Link>

      <nav className="hapak-desktop-nav" style={{ display: 'flex', gap: 14, fontSize: 14, flexWrap: 'wrap' }}>
        {nav.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname.startsWith(href) ? 'page' : undefined}
            style={{ whiteSpace: 'nowrap' }}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          className="tabnum hapak-desktop-only"
          style={{ fontSize: 12, color: 'var(--color-neutral-400)', whiteSpace: 'nowrap' }}
        >
          יום {dayLetter(today)} {fmtFull(today)} · {now}
        </span>

        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-secondary btn-icon"
            aria-label={unread ? `התראות — ${unread} חדשות` : 'התראות'}
            onClick={() => {
              setNotifOpen((v) => !v);
              setMenuOpen(false);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor" aria-hidden>
              <path d="M221.8 175.94c-5.55-9.56-13.8-36.61-13.8-71.94a80 80 0 0 0-160 0c0 35.34-8.26 62.38-13.81 71.94A16 16 0 0 0 48 200h40.81a40 40 0 0 0 78.38 0H208a16 16 0 0 0 13.8-24.06ZM128 216a24 24 0 0 1-22.62-16h45.24A24 24 0 0 1 128 216Z" />
            </svg>
          </button>
          {unread > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -5,
                insetInlineEnd: -5,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                background: 'var(--color-accent)',
                color: 'var(--color-bg)',
                fontSize: 11,
                display: 'grid',
                placeItems: 'center',
                padding: '0 5px',
                pointerEvents: 'none',
              }}
            >
              {unread}
            </span>
          )}
          {notifOpen && (
            <div
              className="card elev-md"
              style={{
                position: 'absolute',
                top: 42,
                insetInlineEnd: 0,
                width: 'min(380px, calc(100vw - 32px))',
                maxHeight: 440,
                overflow: 'auto',
                padding: 10,
                gap: 4,
                zIndex: 30,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px' }}>
                <span className="card-title" style={{ fontSize: 14 }}>
                  התראות
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={async () => {
                    await markNotificationsRead();
                    await refresh();
                  }}
                >
                  סמן הכול כנקרא
                </button>
              </div>
              {notifs.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setNotifOpen(false);
                    if (n.training_id) router.push(`/trainings/${n.training_id}`);
                    else if (/הצטרפות/.test(n.text)) router.push('/teams');
                  }}
                  style={{
                    textAlign: 'start',
                    background: 'transparent',
                    border: 0,
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: '8px 6px',
                    borderRadius: 'var(--radius-sm)',
                    display: 'grid',
                    gridTemplateColumns: '8px 1fr',
                    gap: 10,
                    alignItems: 'start',
                    fontFamily: 'inherit',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      marginTop: 5,
                      background: n.read ? 'transparent' : 'var(--color-accent)',
                    }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12.5, lineHeight: 1.4 }}>{n.text}</span>
                    <span className="tabnum" style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
                      {n.time}
                    </span>
                  </span>
                </button>
              ))}
              {!notifs.length && (
                <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)', padding: 8 }}>אין התראות</span>
              )}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setMenuOpen((v) => !v);
              setNotifOpen(false);
            }}
            aria-label="תפריט משתמש"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
              border: 0,
              color: 'inherit',
              cursor: 'pointer',
              padding: 2,
              fontFamily: 'inherit',
            }}
          >
            <span className="tag tag-outline hapak-desktop-only">{roleLabel(db, user)}</span>
            <Avatar name={user.name} />
          </button>
          {menuOpen && (
            <div
              className="card elev-md"
              style={{
                position: 'absolute',
                top: 42,
                insetInlineEnd: 0,
                width: 300,
                padding: 10,
                gap: 4,
                zIndex: 30,
              }}
            >
              <div style={{ padding: '4px 6px 8px', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 14 }}>{fullName(user)}</span>
                <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  {roleLabel(db, user)}
                  {user.pn ? ` · מ.א. ${user.pn}` : ''}
                </span>
              </div>
              <Link
                className="btn btn-secondary"
                href="/profile"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setMenuOpen(false)}
              >
                הפרופיל שלי
              </Link>
              <Link
                className="btn btn-secondary"
                href="/install"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setMenuOpen(false)}
              >
                התקנה בטלפון והתראות
              </Link>
              {perms.isAdmin && (
                <Link
                  className="btn btn-secondary"
                  href="/manage"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => setMenuOpen(false)}
                >
                  ניהול והגדרות
                </Link>
              )}
              <button
                className="btn btn-ghost"
                style={{ justifyContent: 'flex-start', marginTop: 4 }}
                onClick={() => void signOut()}
              >
                יציאה
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 767px) {
          :global(.hapak-desktop-nav),
          :global(.hapak-desktop-only) {
            display: none !important;
          }
          .hapak-header {
            padding-top: calc(8px + env(safe-area-inset-top)) !important;
          }
        }
      `}</style>
    </header>
  );
}
