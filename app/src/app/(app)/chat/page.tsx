'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ChatTab } from '@/components/training/ChatTab';
import { EmptyState } from '@/components/ui/bits';
import { topicName, trainingTitle, upcomingFor } from '@/lib/core/selectors';
import { markChatRead } from '@/lib/data/mutations';
import { useApp } from '@/lib/data/provider';

/** The phone's chat tab: the conversation for the fighter's next training. */
export default function ChatPage() {
  const { db, user, today } = useApp();
  const router = useRouter();

  const t = db && user ? (upcomingFor(db, user, today)[0] ?? null) : null;

  useEffect(() => {
    if (t) void markChatRead(t.id);
  }, [t]);

  if (!db || !user) return null;

  if (!t)
    return (
      <EmptyState
        title="אין אימון פעיל לצ׳אט"
        sub="לכל אימון יש צ׳אט משלו. כשיפורסם אימון לצוות שלך הוא ייפתח כאן."
        action={
          <button className="btn btn-secondary" onClick={() => router.push('/schedule')}>
            ללו״ז התקופה
          </button>
        }
      />
    );

  return (
    <>
      <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
        {trainingTitle(db, t)} · {topicName(db, t.topic_id)}
      </span>
      <ChatTab training={t} />
    </>
  );
}
