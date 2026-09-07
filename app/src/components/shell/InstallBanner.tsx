'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { canPromptInstall, detectPlatform, isStandalone, onInstallChange, promptInstall } from '@/lib/pwa';

const DISMISSED = 'hapak300.install-banner-dismissed';

/**
 * One line, on phones only, offering the install — and gone for good once
 * dismissed or once the app is on the Home Screen. Most of the unit will only
 * ever open this app on a phone, and a bookmarked tab loses the reminders.
 */
export function InstallBanner() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const sync = () => {
      setCanInstall(canPromptInstall());
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(DISMISSED) === '1';
      } catch {
        /* private mode — just offer it */
      }
      setShow(detectPlatform() !== 'desktop' && !isStandalone() && !dismissed);
    };
    sync();
    return onInstallChange(sync);
  }, []);

  if (!show || pathname === '/install') return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      /* nothing to remember it with; the banner returns next time */
    }
    setShow(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 16px',
        borderBottom: '1px solid var(--color-divider)',
        background: 'var(--color-neutral-900)',
      }}
    >
      <span style={{ fontSize: 12.5, flex: 1, lineHeight: 1.45 }}>
        התקן את האפליקציה על הטלפון וקבל תזכורות לאימונים.
      </span>
      {/* Android hands us a real installer — use it here rather than sending
          the fighter to a page to read instructions they do not need. */}
      {canInstall ? (
        <button
          className="btn btn-primary"
          style={{ fontSize: 12.5, minHeight: 34 }}
          onClick={() => void promptInstall().then(() => setShow(!isStandalone()))}
        >
          התקן עכשיו
        </button>
      ) : (
        <Link className="btn btn-primary" href="/install" style={{ fontSize: 12.5, minHeight: 34 }}>
          התקנה
        </Link>
      )}
      <button className="btn btn-ghost btn-icon" onClick={dismiss} aria-label="לא עכשיו" style={{ minHeight: 34 }}>
        ✕
      </button>
    </div>
  );
}
