'use client';

import type { CSSProperties, ReactNode } from 'react';
import { initials as initialsOf } from '@/lib/core/selectors';

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        background: 'var(--color-accent-900)',
        color: 'var(--color-accent-200)',
        display: 'grid',
        placeItems: 'center',
        fontSize: Math.max(10, Math.round(size * 0.34)),
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function Tag({
  children,
  kind = 'neutral',
  style,
}: {
  children: ReactNode;
  kind?: 'accent' | 'neutral' | 'outline';
  style?: CSSProperties;
}) {
  return (
    <span className={`tag tag-${kind}`} style={style}>
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="field" style={style}>
      <label>{label}</label>
      {children}
    </div>
  );
}

/** The 10-segment readiness meter used on the schedule, teams and profile. */
export function ScoreBar({ score, cell = 6 }: { score: number; cell?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          style={{
            height: cell,
            borderRadius: 2,
            background: i < Math.round(score) ? 'var(--color-accent)' : 'var(--color-neutral-800)',
          }}
        />
      ))}
    </div>
  );
}

export function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          flex: 1,
          height: 3,
          borderRadius: 2,
          background: 'var(--color-neutral-800)',
          overflow: 'hidden',
        }}
      >
        <div style={{ height: '100%', background: 'var(--color-accent)', width: `${pct}%` }} />
      </div>
      <span className="tabnum" style={{ fontSize: 11.5, color: 'var(--color-neutral-400)' }}>
        {label}
      </span>
    </div>
  );
}

export function EmptyState({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        border: '1px dashed var(--color-neutral-800)',
        borderRadius: 'var(--radius-md)',
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-start',
      }}
    >
      <span style={{ fontSize: 15 }}>{title}</span>
      {sub ? <span style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>{sub}</span> : null}
      {action}
    </div>
  );
}

export function SectionCard({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section className="card" style={{ padding: '14px 16px', gap: 10, ...style }}>
      {title || right ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {title ? (
            <span className="card-title" style={{ fontSize: 14 }}>
              {title}
            </span>
          ) : (
            <span />
          )}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function AlertList({ items, title }: { items: string[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section
      className="card"
      style={{ padding: '14px 16px', gap: 6, boxShadow: '0 0 0 1px var(--color-accent-800)' }}
    >
      {title ? (
        <span className="card-title" style={{ fontSize: 14 }}>
          {title}
        </span>
      ) : null}
      {items.map((a, i) => (
        <span key={i} style={{ fontSize: 13, color: 'var(--color-accent-300)' }}>
          • {a}
        </span>
      ))}
    </section>
  );
}
