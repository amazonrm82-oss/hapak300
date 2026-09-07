'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppHeader } from '@/components/shell/AppHeader';
import { InviteBanners } from '@/components/shell/InviteBanners';
import { MobileTabs } from '@/components/shell/MobileTabs';
import { useApp } from '@/lib/data/provider';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { db, user, loading, error } = useApp();

  useEffect(() => {
    if (!loading && !db) router.replace('/login');
  }, [loading, db, router]);

  if (error)
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card" style={{ padding: 20, maxWidth: 520, gap: 10 }}>
          <span className="card-title">לא הצלחנו לטעון את נתוני היחידה</span>
          <span style={{ fontSize: 13, color: 'var(--color-accent-300)' }}>{error}</span>
          <button className="btn btn-secondary" onClick={() => location.reload()}>
            נסה שוב
          </button>
        </div>
      </div>
    );

  if (loading || !db || !user)
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--color-neutral-500)',
          fontSize: 13,
        }}
      >
        טוען את נתוני היחידה…
      </div>
    );

  return (
    <>
      <AppHeader />
      <InviteBanners />
      <main
        style={{
          padding: '20px 24px 56px',
          maxWidth: 1400,
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          flex: 1,
        }}
        className="hapak-main"
      >
        {children}
      </main>
      <MobileTabs />
      <style jsx global>{`
        @media (max-width: 767px) {
          .hapak-main {
            padding: 14px 16px calc(96px + env(safe-area-inset-bottom)) !important;
            gap: 12px !important;
          }
        }
      `}</style>
    </>
  );
}
