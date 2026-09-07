'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useApp } from '@/lib/data/provider';
import { detectPlatform, isStandalone } from '@/lib/pwa';

/**
 * Subscribes this device to Web Push so the evening and morning reminders
 * arrive even when the app is closed. One subscription per device.
 *
 * "Enabled" is a fact about the server, not about the browser. The browser
 * keeps its subscription even when saving it here failed, which left the
 * button saying notifications were on while nothing could ever be delivered —
 * and the test push answering "no devices". So the check reads both sides and
 * repairs the mismatch itself, and says out loud when it cannot.
 *
 * Every other dead end also says why rather than disappearing: an iPhone that
 * has not been added to the Home Screen has no Push API at all, a blocked
 * permission cannot be re-asked from the page, and a deployment without VAPID
 * keys cannot subscribe anyone.
 */
type State =
  | 'loading'
  | 'off'
  | 'on'
  | 'busy'
  | 'blocked'
  | 'needs-install'
  | 'unsupported'
  | 'unconfigured';

interface SubJson {
  endpoint?: string;
  keys?: { p256dh: string; auth: string };
}

export function PushToggle() {
  const { user, toast } = useApp();
  const [state, setState] = useState<State>('loading');
  const [devices, setDevices] = useState(0);
  const [problem, setProblem] = useState('');
  const [testing, setTesting] = useState(false);

  const userId = user?.id;

  /** Writes this browser's subscription to the server. Returns an error message. */
  const save = useCallback(
    async (sub: PushSubscription, personId: string): Promise<string> => {
      const json = sub.toJSON() as SubJson;
      if (!json.endpoint || !json.keys) return 'הדפדפן לא סיפק מנוי תקין להתראות';
      const { error } = await supabase().from('push_subscriptions').upsert(
        {
          person_id: personId,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        { onConflict: 'endpoint' },
      );
      return error ? error.message : '';
    },
    [],
  );

  const detect = useCallback(async () => {
    if (typeof window === 'undefined' || !userId) return;
    setProblem('');

    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return setState('unconfigured');

    if (!('serviceWorker' in navigator) || !('PushManager' in window))
      // on iOS the Push API exists only once the app is on the Home Screen
      return setState(detectPlatform() === 'ios' && !isStandalone() ? 'needs-install' : 'unsupported');

    if (typeof Notification !== 'undefined' && Notification.permission === 'denied')
      return setState('blocked');

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      const { count } = await supabase()
        .from('push_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('person_id', userId);
      setDevices(count ?? 0);

      if (!sub) return setState('off');

      // the browser is subscribed — make sure the server knows about it too
      const { data: known } = await supabase()
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', sub.endpoint)
        .maybeSingle();

      if (known) return setState('on');

      const err = await save(sub, userId);
      if (err) {
        setProblem(err);
        return setState('off');
      }
      setDevices((n) => n + 1);
      setState('on');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      setState('off');
    }
  }, [userId, save]);

  useEffect(() => {
    void detect();
  }, [detect]);

  if (!user) return null;

  const enable = async () => {
    setState('busy');
    setProblem('');
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
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }));

      const err = await save(sub, user.id);
      if (err) throw new Error(err);

      await detect();
      toast('התראות מופעלות במכשיר הזה');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'הפעלת ההתראות נכשלה';
      setProblem(msg);
      setState('off');
      toast(msg);
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
      await detect();
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

      if (body.sent) {
        toast(`נשלחה התראת בדיקה ל-${body.sent} מכשירים — אמורה להופיע תוך שניות`);
      } else {
        // the server has no subscription for this person: re-register and retry
        toast('המכשיר לא היה רשום בשרת — רושם אותו עכשיו');
        await detect();
        toast('נסה ״שלח התראת בדיקה״ שוב');
      }
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
        התראות פוש עדיין לא הופעלו בשרת — מנהל המערכת צריך להוסיף את מפתחות ה-VAPID ב-Vercel
        ולעשות Redeploy.
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
        {devices > 0
          ? `${devices} מכשירים רשומים לחשבון שלך · נדרש פעם אחת בכל מכשיר`
          : 'נדרש פעם אחת בכל מכשיר. באייפון — רק לאחר הוספה למסך הבית.'}
      </span>

      {problem && (
        <span style={{ fontSize: 11.5, color: 'var(--color-accent-300)', lineHeight: 1.6 }}>
          רישום המכשיר בשרת נכשל: {problem}
        </span>
      )}
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
