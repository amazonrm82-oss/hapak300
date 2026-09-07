'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useApp } from '@/lib/data/provider';

export default function Home() {
  const router = useRouter();
  const { db, loading } = useApp();

  useEffect(() => {
    if (loading) return;
    router.replace(db ? '/schedule' : '/login');
  }, [loading, db, router]);

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
      טוען…
    </div>
  );
}
