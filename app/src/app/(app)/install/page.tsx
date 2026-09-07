'use client';

import { InstallPanel } from '@/components/InstallPanel';

export default function InstallPage() {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h1 className="card-title" style={{ fontSize: 19, margin: 0 }}>
          התקנה בטלפון והתראות
        </h1>
        <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>
          אייפון או גלקסי · האפליקציה על מסך הבית, והתזכורות ישירות לטלפון
        </span>
      </div>
      <InstallPanel />
    </>
  );
}
