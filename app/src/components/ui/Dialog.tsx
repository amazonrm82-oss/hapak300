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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="dialog-backdrop"
      onClick={onClose}
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
        onClick={(e) => e.stopPropagation()}
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
        <span className="dialog-title">{title}</span>
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
