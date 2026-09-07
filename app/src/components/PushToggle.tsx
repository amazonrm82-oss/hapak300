'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useApp } from '@/lib/data/provider';

/**
 * Subscribes this device to Web Push so the evening and morning reminders
 * arrive even when the app is closed. One subscription per device.
 */
export function PushToggle() {
  const { user, toast } = useApp();
  const [state, setState] = useState<'unsupported' | 'off' | 'on' | 'busy'>('off');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  if (state === 'unsupported' || !user) return null;

  const enable = async () => {
    setState('busy');
    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error('התראות פוש לא מוגדרות בשרת');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('הדפדפן חסם את ההתראות');

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

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
      <button
        className={`btn ${state === 'on' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => void (state === 'on' ? disable() : enable())}
        disabled={state === 'busy'}
        style={{ fontSize: 12.5 }}
      >
        {state === 'on' ? 'התראות פעילות במכשיר הזה' : 'הפעל התראות במכשיר הזה'}
      </button>
      <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
        נדרש פעם אחת בכל מכשיר; באייפון — לאחר הוספה למסך הבית.
      </span>
    </div>
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
