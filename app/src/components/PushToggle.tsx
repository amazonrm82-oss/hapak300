'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useApp } from '@/lib/data/provider';
import { detectPlatform, isStandalone } from '@/lib/pwa';

/**
 * Subscribes this device to Web Push so the evening and morning reminders
 * arrive even when the app is closed. One subscription per device.
 *
 * Every dead end says why out loud rather than disappearing: an iPhone that has
 * not been added to the Home Screen has no Push API at all, a blocked
 * permission cannot be re-asked from the page, and a deployment without VAPID
 * keys cannot subscribe anyone. Each of those looked identical before — a
 * button that quietly wasn't there.
 */
type State = 'loading' | 'off' | 'on' | 'busy' | 'blocked' | 'needs-install' | 'unsupported' | 'unconfigured';

export function PushToggle() {
  const { user, toast } = useApp();
  const [state, setState] = useState<State>('loading');
  const [testing, setTesting] = useState(false);

  const detect = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      setState('unconfigured');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // on iOS the Push API exists only once the app is on the Home Screen
      setState(detectPlatform() === 'ios' && !isStandalone() ? 'needs-install' : 'unsupported');
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      setState('blocked');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  useEffect(detect, [detect]);

  if (!user) return null;

  const enable = async () => {
    setState('busy');
    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error('התראות פוש לא מוגדרות בשרת');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        toast('ההתראות לא אושרו במכשיר');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };

      const { error } = await supabase().from('push_subscriptions').upsert(
        {
          person_id: user.id,
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
        },
        { onConflict: 'endpoint' },
      );
      if (error) throw new Error(error.message);

      setState('on');
      toast('התראות מופעלות במכשיר הזה');
    } catch (e) {
      setState('off');
      toast(e instanceof Error ? e.message : 'הפעלת ההתראות נכשלה');
    }
  };

  const disable = async () => {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
      toast('ההתראות כובו במכשיר הזה');
    } catch {
      setState('off');
    }
  };

  /** Proves the whole chain — server, keys, subscription, phone — in one tap. */
  const sendTest = async () => {
    setTesting(true);
    try {
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('ההתחברות פגה — היכנס מחדש');
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'שליחת הבדיקה נכשלה');
      toast(
        body.sent
          ? `נשלחה התראת בדיקה ל-${body.sent} מכשירים — אמורה להופיע תוך שניות`
          : 'לא נמצאו מכשירים רשומים — הפעל התראות במכשיר הזה',
      );
      if (!body.sent) detect();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'שליחת הבדיקה נכשלה');
    } finally {
      setTesting(false);
    }
  };

  if (state === 'loading') return null;

  if (state === 'unconfigured')
    return (
      <Note>
        התראות פוש עדיין לא הופעלו בשרת — מנהל המערכת צריך להוסיף את מפתחות ה-VAPID ב-Vercel.
      </Note>
    );

  if (state === 'needs-install')
    return (
      <Note>
        באייפון התראות עובדות רק אחרי שמוסיפים את האפליקציה למסך הבית. עשה זאת במסך «התקנה בטלפון»,
        פתח את האפליקציה מהאייקון החדש — ואז חזור לכאן.
      </Note>
    );

  if (state === 'unsupported')
    return <Note>הדפדפן הזה אינו תומך בהתראות פוש. נסה Chrome באנדרואיד או Safari באייפון.</Note>;

  if (state === 'blocked')
    return (
      <Note>
        ההתראות חסומות בהגדרות המכשיר לאתר הזה. אנדרואיד: Chrome ⋮ ← הגדרות אתר ← התראות ← אפשר.
        אייפון: הגדרות ← התראות ← «כשירות חפ״ק» ← אפשר התראות. אחר כך רענן את הדף.
      </Note>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          className={`btn ${state === 'on' ? 'btn-secondary' : 'btn-primary'}`}
          onClick={() => void (state === 'on' ? disable() : enable())}
          disabled={state === 'busy'}
          style={{ fontSize: 12.5 }}
        >
          {state === 'on' ? 'התראות פעילות במכשיר הזה — כבה' : 'הפעל התראות בטלפון'}
        </button>
        {state === 'on' && (
          <button
            className="btn btn-ghost"
            onClick={() => void sendTest()}
            disabled={testing}
            style={{ fontSize: 12.5 }}
          >
            {testing ? 'שולח…' : 'שלח התראת בדיקה'}
          </button>
        )}
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
        נדרש פעם אחת בכל מכשיר. באייפון — רק לאחר הוספה למסך הבית.
      </span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-neutral-400)', marginTop: 4 }}>
      {children}
    </span>
  );
}

/** VAPID keys arrive base64url-encoded; the Push API wants raw bytes. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
