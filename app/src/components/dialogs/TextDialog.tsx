'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';

/** Read-only text (the training order) for copying by hand when the clipboard is blocked. */
export function TextDialog({
  open,
  title,
  text,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width={640}
      actions={
        <button className="btn btn-primary" onClick={onClose}>
          סגור
        </button>
      }
    >
      <textarea
        className="input"
        rows={14}
        readOnly
        value={text}
        style={{ fontSize: 12.5, lineHeight: 1.5 }}
      />
    </Dialog>
  );
}

/**
 * Copies the training order to the clipboard, falling back to a dialog the
 * commander can copy from when the browser refuses.
 */
export function useShareOrder(toast: (m: string) => void) {
  const [fallback, setFallback] = useState<string | null>(null);

  const share = (text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast('פקודת האימון הועתקה — אפשר להדביק בוואטסאפ'),
        () => setFallback(text),
      );
    } else {
      setFallback(text);
    }
  };

  const dialog = (
    <TextDialog
      open={fallback !== null}
      title="פקודת אימון — להעתקה"
      text={fallback ?? ''}
      onClose={() => setFallback(null)}
    />
  );

  return { share, dialog };
}
