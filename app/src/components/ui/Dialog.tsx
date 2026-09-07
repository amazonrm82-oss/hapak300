'use client';

import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  body?: string;
  children?: ReactNode;
  actions?: ReactNode;
  width?: number;
  /** On phones the dialog rises from the bottom, as in the app prototype. */
  sheet?: boolean;
}

export function Dialog({ open, onClose, title, body, children, actions, width = 640, sheet }: Props) {
  // A dialog closes only through the ✕ (or its own buttons) — never by tapping
  // outside it and never on Escape. Half of these forms are long, and losing a
  // half-filled training to a stray tap on the backdrop is worse than an extra
  // deliberate tap to leave.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="dialog-backdrop"
      style={{
        zIndex: 50,
        overflow: 'auto',
        alignItems: sheet ? 'flex-end' : 'flex-start',
        paddingTop: sheet ? undefined : '6vh',
        padding: sheet ? 0 : undefined,
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={
          sheet
            ? {
                width: '100%',
                maxWidth: '100%',
                borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                padding: '16px 16px calc(28px + env(safe-area-inset-bottom))',
                maxHeight: '88vh',
                overflow: 'auto',
              }
            : { width: `min(${width}px, 100%)`, maxHeight: '88vh', overflow: 'auto' }
        }
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span className="dialog-title" style={{ flex: 1, minWidth: 0 }}>
            {title}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="סגירה"
            title="סגירה"
            style={{ flex: 'none', marginTop: -2, fontSize: 18, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        {body ? <span className="dialog-body">{body}</span> : null}
        {children}
        {actions ? <div className="dialog-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Yes/no confirmation with the same shape as the prototype's. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'אישור',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      body={body}
      width={520}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}
