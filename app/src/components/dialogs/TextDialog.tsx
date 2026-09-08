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
 * Puts a report where the unit actually sends it: WhatsApp.
 *
 * `share` copies to the clipboard — the reliable path on every browser. `toWhatsApp`
 * copies as well and then opens WhatsApp with the message already written, which
 * is one tap instead of three; the copy is what saves it when a phone blocks the
 * new window. A browser that refuses the clipboard altogether gets the text in a
 * dialog to copy by hand, so there is always a way out.
 */
export function useShareOrder(toast: (m: string) => void) {
  const [fallback, setFallback] = useState<string | null>(null);
  const [title, setTitle] = useState('פקודת אימון — להעתקה');

  const copy = (text: string, label: string, then?: () => void) => {
    setTitle(`${label} — להעתקה`);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => {
          toast(`${label} הועתק${then ? '' : ' — אפשר להדביק בוואטסאפ'}`);
          then?.();
        },
        () => setFallback(text),
      );
    } else {
      setFallback(text);
    }
  };

  const share = (text: string, label = 'פקודת האימון') => copy(text, label);

  const toWhatsApp = (text: string, label = 'הדו״ח') =>
    copy(text, label, () => {
      const w = window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      if (!w) toast(`${label} הועתק — הדבק בוואטסאפ ידנית`);
    });

  const dialog = (
    <TextDialog
      open={fallback !== null}
      title={title}
      text={fallback ?? ''}
      onClose={() => setFallback(null)}
    />
  );

  return { share, toWhatsApp, dialog };
}
