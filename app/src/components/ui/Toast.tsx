'use client';

import { useApp } from '@/lib/data/provider';

export function Toast() {
  const { toastMsg } = useApp();
  if (!toastMsg) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 'calc(22px + env(safe-area-inset-bottom))',
        insetInlineStart: '50%',
        transform: 'translateX(50%)',
        background: 'var(--color-surface)',
        color: 'var(--color-text)',
        padding: '10px 16px',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        fontSize: 13,
        zIndex: 60,
        maxWidth: 'min(560px, 90vw)',
        textAlign: 'center',
      }}
    >
      {toastMsg}
    </div>
  );
}
