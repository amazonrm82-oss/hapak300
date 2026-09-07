'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar, Tag } from '@/components/ui/bits';
import { permsFor } from '@/lib/core/permissions';
import { fullName, personById } from '@/lib/core/selectors';
import type { TrainingFull } from '@/lib/core/types';
import { sendMessage, togglePin } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

/**
 * One chat per training: everyone writes, commanders pin, and each message
 * shows how many people have read it.
 */
export function ChatTab({ training: t }: { training: TrainingFull }) {
  const { db, user, toast, refresh } = useApp();
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<TrainingFull['chat'][number]['attachment']>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [t.chat.length]);

  if (!db || !user) return null;

  const perms = permsFor(db, user, t);
  const pinned = t.chat.filter((m) => m.pinned);

  const send = async () => {
    if (!draft.trim() && !attachment) return;
    try {
      await sendMessage(t.id, user.id, draft, attachment);
      setDraft('');
      setAttachment(null);
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'שליחת ההודעה נכשלה');
    }
  };

  const roleTag = (authorId: string) => {
    if (authorId === t.commander_id) return 'מפקד אימון';
    if (authorId === t.instructor_id) return 'מדריך';
    return personById(db, authorId)?.is_team_commander ? 'מפ״צ' : '';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 10, maxWidth: 860 }}>
      {pinned.map((m) => (
        <div
          key={m.id}
          className="card"
          style={{ padding: '10px 14px', gap: 4, boxShadow: '0 0 0 1px var(--color-accent-700)' }}
        >
          <span style={{ fontSize: 11, color: 'var(--color-accent)' }}>
            הודעה נעוצה · {fullName(personById(db, m.author_id))}
          </span>
          <span style={{ fontSize: 13.5 }}>{m.text}</span>
        </div>
      ))}

      <div
        ref={scroller}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minHeight: 240,
          maxHeight: '52vh',
          overflow: 'auto',
          padding: 4,
        }}
      >
        {t.chat.map((m) => {
          const author = personById(db, m.author_id);
          const readers = m.read_by.filter((x) => x !== m.author_id).length;
          const mine = m.author_id === user.id;
          const tag = roleTag(m.author_id);
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                maxWidth: '78%',
                alignSelf: mine ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11.5,
                  color: 'var(--color-neutral-500)',
                }}
              >
                <Avatar name={author?.name ?? '?'} size={22} />
                <span>{fullName(author)}</span>
                {tag && (
                  <Tag kind="outline" style={{ fontSize: 10, padding: '1px 6px' }}>
                    {tag}
                  </Tag>
                )}
                <span className="tabnum">{m.time}</span>
              </div>
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  background: mine ? 'var(--color-accent-900)' : 'var(--color-surface)',
                }}
              >
                {m.text}
                {m.attachment && (
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-neutral-400)', marginTop: 4 }}>
                    קובץ מצורף: {m.attachment.name}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--color-neutral-500)' }}>
                <span>{readers ? `נקרא על ידי ${readers}` : 'טרם נקרא'}</span>
                {perms.canPin && (
                  <button
                    onClick={async () => {
                      try {
                        await togglePin(m.id, !m.pinned);
                        await refresh();
                      } catch (e) {
                        toast(e instanceof Error ? e.message : 'הפעולה נכשלה');
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: 0,
                      color: 'var(--color-accent)',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: 0,
                      fontFamily: 'inherit',
                    }}
                  >
                    {m.pinned ? 'בטל נעיצה' : 'נעץ'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!t.chat.length && (
          <span style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
            עדיין אין הודעות — כל הצוות יכול לכתוב, מפקדים יכולים לנעוץ הודעה.
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          className="input"
          rows={2}
          placeholder="הודעה לצוות… (Enter לשליחה)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          style={{ minHeight: 44, flex: 1 }}
        />
        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
          תמונה / קובץ
          <input
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xlsx"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file)
                setAttachment({
                  name: file.name,
                  is_image: file.type.startsWith('image/'),
                  url: null,
                  size: Math.round(file.size / 1024),
                });
            }}
          />
        </label>
        <button className="btn btn-primary" onClick={() => void send()}>
          שליחה
        </button>
      </div>

      {attachment && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--color-neutral-400)' }}>
          <span>מצורף: {attachment.name}</span>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setAttachment(null)}>
            הסר
          </button>
        </div>
      )}
    </div>
  );
}
