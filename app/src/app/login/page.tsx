'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { JoinRequestDialog } from '@/components/JoinRequestDialog';
import { Field } from '@/components/ui/bits';
import { useApp } from '@/lib/data/provider';
import { callServer, supabase } from '@/lib/supabase/client';

type Stage = 'pn' | 'pin' | 'set-pin';

/** Where this device keeps the personal number it was asked to remember. */
const REMEMBER_KEY = 'hapak-remember-pn';

interface LoginResponse {
  stage: Stage | 'ok';
  name?: string;
  access_token?: string;
  refresh_token?: string;
}

/**
 * Two steps, exactly as the unit decided: personal number, then a four-digit
 * code — chosen on first login, required on every login after that. Only people
 * the administrator or the HQ-party commander has added can get in.
 */
export default function LoginPage() {
  const router = useRouter();
  const { db, user, toast } = useApp();
  const [stage, setStage] = useState<Stage>('pn');
  const [pn, setPn] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [who, setWho] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [remember, setRemember] = useState(true);
  // the remembered number is opened once, not on every render
  const started = useRef(false);

  useEffect(() => {
    if (user) router.replace('/schedule');
  }, [user, router]);

  /**
   * A remembered personal number skips the first step.
   *
   * The number is not the secret — the code is — and typing seven digits on a
   * phone in the dark before an 05:30 departure is the part people give up on.
   * It is kept on this device only, it is offered rather than assumed, and
   * ״לא אתה?״ clears it in one tap.
   */
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let saved = '';
    try {
      saved = localStorage.getItem(REMEMBER_KEY) ?? '';
    } catch {
      /* a browser with storage blocked simply does not remember */
    }
    if (!/^\d{7}$/.test(saved)) return;
    setPn(saved);
    void openFor(saved);
    // once, on the way in: `openFor` is stable enough for this and re-running it
    // would ask the server about the same number again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allowJoin = db?.settings.allow_join !== false;
  const appName = db?.settings.app_name ?? 'כשירות חפ״ק מח״ט 300';

  async function applySession(r: LoginResponse) {
    if (!r.access_token || !r.refresh_token) throw new Error('ההתחברות נכשלה');
    const { error } = await supabase().auth.setSession({
      access_token: r.access_token,
      refresh_token: r.refresh_token,
    });
    if (error) throw new Error(error.message);
    router.replace('/schedule');
  }

  /** The first step for one number, used by the form and by the remembered one. */
  async function openFor(number: string) {
    setErr('');
    setBusy(true);
    try {
      const r = await callServer<LoginResponse>('/api/auth/login', { pn: number });
      setWho(r.name ?? '');
      setStage(r.stage === 'set-pin' ? 'set-pin' : 'pin');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ההתחברות נכשלה');
      forget();
      setStage('pn');
    } finally {
      setBusy(false);
    }
  }

  /** Stops remembering this device's number. */
  function forget() {
    try {
      localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* nothing to forget */
    }
  }

  async function submit() {
    setErr('');
    setBusy(true);
    try {
      if (stage === 'pn') {
        if (!/^\d{7}$/.test(pn)) throw new Error('מספר אישי חייב להיות 7 ספרות');
        const r = await callServer<LoginResponse>('/api/auth/login', { pn });
        try {
          if (remember) localStorage.setItem(REMEMBER_KEY, pn);
          else localStorage.removeItem(REMEMBER_KEY);
        } catch {
          /* storage blocked: the number is simply not remembered */
        }
        setWho(r.name ?? '');
        setStage(r.stage === 'set-pin' ? 'set-pin' : 'pin');
        return;
      }

      if (stage === 'set-pin') {
        const r = await callServer<LoginResponse>('/api/auth/set-pin', { pn, pin, pin2 });
        await applySession(r);
        toast('הקוד נשמר — בכניסה הבאה תקליד מספר אישי וקוד');
        return;
      }

      if (!/^\d{4}$/.test(pin)) throw new Error('הקוד חייב להיות 4 ספרות');
      const r = await callServer<LoginResponse>('/api/auth/login', { pn, pin });
      if (r.stage === 'set-pin') {
        setStage('set-pin');
        return;
      }
      await applySession(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ההתחברות נכשלה');
      if (stage === 'pin') setPin('');
    } finally {
      setBusy(false);
    }
  }

  const back = () => {
    forget();
    setStage('pn');
    setPin('');
    setPin2('');
    setErr('');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void submit();
  };

  const buttonLabel = stage === 'set-pin' ? 'שמור קוד והיכנס' : stage === 'pin' ? 'כניסה' : 'המשך';

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: 'min(520px, 100%)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Image src="/emblem.png" alt="" width={96} height={96} style={{ height: 96, width: 'auto' }} priority />
        <h1 style={{ fontSize: 32, margin: 0 }}>{appName}</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-neutral-400)', textWrap: 'pretty' }}>
          תוכנית האימונים של שני צוותי החפ״ק — לו״ז, נוכחות, מדריכים ומפקדי אימון, לוגיסטיקה ותחמושת.
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-neutral-500)', textWrap: 'pretty' }}>
          הכניסה במספר אישי — רק למי שמנהל המערכת או מפקד החפ״ק הוסיפו למערכת, עם הדרגה, התפקיד וההרשאות שהוגדרו לו.
        </p>

        <div className="card elev-sm" style={{ padding: '14px 16px', gap: 10 }}>
          <Field label="מספר אישי (7 ספרות)">
            <input
              className="input tabnum"
              inputMode="numeric"
              autoComplete="username"
              maxLength={7}
              value={pn}
              disabled={stage !== 'pn'}
              onChange={(e) => {
                setPn(e.target.value.replace(/\D/g, '').slice(0, 7));
                setErr('');
              }}
              onKeyDown={onKey}
              placeholder="7 ספרות"
              style={{ letterSpacing: '.1em', fontSize: 18, textAlign: 'center' }}
            />
          </Field>

          {stage === 'pn' && (
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              זכור אותי במכשיר הזה — בכניסה הבאה רק הקוד
            </label>
          )}

          {stage !== 'pn' && (
            <Field
              label={
                stage === 'set-pin'
                  ? 'כניסה ראשונה — בחר קוד כניסה (4 ספרות)'
                  : 'קוד כניסה (4 ספרות)'
              }
            >
              <input
                className="input"
                type="password"
                inputMode="numeric"
                autoComplete={stage === 'set-pin' ? 'new-password' : 'current-password'}
                maxLength={4}
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                  setErr('');
                }}
                onKeyDown={onKey}
                placeholder="••••"
                style={{ fontSize: 20, textAlign: 'center', letterSpacing: '.4em' }}
              />
            </Field>
          )}

          {stage === 'set-pin' && (
            <Field label="אימות הקוד">
              <input
                className="input"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                value={pin2}
                onChange={(e) => {
                  setPin2(e.target.value.replace(/\D/g, '').slice(0, 4));
                  setErr('');
                }}
                onKeyDown={onKey}
                placeholder="••••"
                style={{ fontSize: 20, textAlign: 'center', letterSpacing: '.4em' }}
              />
            </Field>
          )}

          {err && (
            <span role="alert" style={{ fontSize: 12.5, color: 'var(--color-accent-300)' }}>
              {err}
            </span>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => void submit()} disabled={busy}>
              {busy ? 'רגע…' : buttonLabel}
            </button>
            {stage !== 'pn' && (
              <button className="btn btn-ghost" onClick={back} disabled={busy}>
                לא אתה? החלף מספר
              </button>
            )}
            {allowJoin && stage === 'pn' && (
              <button
                className="btn btn-secondary"
                onClick={() => setJoinOpen(true)}
                style={{ whiteSpace: 'nowrap' }}
              >
                בקשת הצטרפות
              </button>
            )}
          </div>

          {stage === 'set-pin' && (
            <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
              הקוד יידרש בכל כניסה. שכחת? מנהל המערכת או מפקד החפ״ק יכולים לאפס אותו.
            </span>
          )}
        </div>
      </div>

      <JoinRequestDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </main>
  );
}
