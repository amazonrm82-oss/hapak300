'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { realNow, realToday } from '@/lib/core/dates';
import { permsFor, type Perms } from '@/lib/core/permissions';
import type { Db, Person } from '@/lib/core/types';
import { supabase } from '@/lib/supabase/client';
import { loadDb } from './load';

interface AppState {
  db: Db | null;
  user: Person | null;
  perms: Perms;
  loading: boolean;
  error: string;
  today: string;
  now: string;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const Ctx = createContext<AppState | null>(null);

/** Half an hour untouched ends the session. */
const IDLE_LIMIT_MS = 30 * 60 * 1000;

/** Tables whose changes should pull a fresh snapshot. */
const WATCHED = [
  'trainings',
  'attendance',
  'chat_messages',
  'notifications',
  'gear_items',
  'vehicles',
  'ammo',
  'food',
  'calendar_events',
  'people',
  'day_blocks',
  'feedback',
  'photos',
  'join_requests',
  'fleet',
  'periods',
  'drills',
  'drill_results',
];

export function DataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  // the person this session belongs to, from the JWT's `person_id` claim
  const [personId, setPersonId] = useState<string | null>(null);
  const [authId, setAuthId] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [clock, setClock] = useState({ today: realToday(), now: realNow() });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await loadDb();
      setDb(next);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'טעינת הנתונים נכשלה');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Realtime fires per row; coalesce a burst into one snapshot reload. */
  const scheduleRefresh = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => void refresh(), 250);
  }, [refresh]);

  useEffect(() => {
    const sb = supabase();
    const adopt = (session: { user: { id: string; app_metadata?: Record<string, unknown> } } | null) => {
      setAuthId(session?.user.id ?? null);
      setPersonId((session?.user.app_metadata?.person_id as string) ?? null);
    };

    sb.auth.getSession().then(({ data }) => {
      adopt(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_evt, session) => {
      adopt(session);
      if (!session) {
        setDb(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authId) return;
    setLoading(true);
    void refresh();

    const sb = supabase();
    const channel = sb.channel('hapak-changes');
    WATCHED.forEach((table) =>
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh),
    );
    channel.subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [authId, refresh, scheduleRefresh]);

  // the header shows a 24-hour clock and the day rolls over at midnight
  useEffect(() => {
    const id = setInterval(() => setClock({ today: realToday(), now: realNow() }), 30_000);
    return () => clearInterval(id);
  }, []);

  const user = useMemo(
    () => (db && personId ? (db.people.find((p) => p.id === personId) ?? null) : null),
    [db, personId],
  );

  /**
   * The session was ended elsewhere — a commander disconnected this device, or
   * the fighter was marked inactive. The database stops answering as soon as
   * that happens, so the roster comes back empty; without this the screen would
   * sit on "loading" forever instead of saying what happened.
   */
  useEffect(() => {
    if (loading || !db || !personId || user) return;
    void supabase()
      .auth.signOut()
      .then(() => {
        setDb(null);
        setAuthId(null);
        setError('החיבור למכשיר הזה נותק. היכנס מחדש עם המספר האישי והקוד.');
      });
  }, [loading, db, personId, user]);

  /**
   * Signed out after half an hour untouched. On a phone with the app on the
   * Home Screen the tab never closes, so the session would otherwise stay open
   * until the device died — which is exactly the wrong behaviour for a phone
   * that gets left somewhere.
   */
  useEffect(() => {
    if (!authId) return;
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'visibilitychange'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    const id = setInterval(() => {
      if (Date.now() - last < IDLE_LIMIT_MS) return;
      void supabase()
        .auth.signOut()
        .then(() => {
          setDb(null);
          setAuthId(null);
          setError('הסשן הסתיים לאחר חצי שעה ללא פעילות. היכנס מחדש.');
        });
    }, 60_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(id);
    };
  }, [authId]);

  const perms = useMemo(() => (db ? permsFor(db, user, null) : permsFor(EMPTY_DB, null, null)), [db, user]);

  const toast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setDb(null);
    setAuthId(null);
  }, []);

  const value: AppState = {
    db,
    user,
    perms,
    loading,
    error,
    today: clock.today,
    now: clock.now,
    refresh,
    signOut,
    toast,
    toastMsg,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <DataProvider>');
  return v;
}

const EMPTY_DB = {
  teams: { a: { id: 'a', name: '', commander_id: null }, b: { id: 'b', name: '', commander_id: null } },
} as unknown as Db;
