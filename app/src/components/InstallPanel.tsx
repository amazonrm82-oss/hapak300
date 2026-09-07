'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { SectionCard } from '@/components/ui/bits';
import { PushToggle } from '@/components/PushToggle';
import {
  canPromptInstall,
  detectPlatform,
  isIosNonSafari,
  isStandalone,
  onInstallChange,
  promptInstall,
  type Platform,
} from '@/lib/pwa';
import { useApp } from '@/lib/data/provider';

/**
 * "התקנה בטלפון" — the app on the Home Screen, and the reminders on the phone.
 *
 * There is no App Store build and there does not need to be: the app installs
 * straight from the browser. The two phones do it differently enough that
 * one set of instructions would be wrong for half the unit, so the screen picks
 * the right one by itself and still lets the other be opened.
 */

const STEPS: Record<Exclude<Platform, 'desktop'>, { browser: string; steps: string[] }> = {
  ios: {
    browser: 'אייפון · Safari',
    steps: [
      'פתח את האתר ב-Safari (לא ב-Chrome — באייפון רק Safari יודע להתקין).',
      'הקש על כפתור השיתוף — הריבוע עם החץ כלפי מעלה, בתחתית המסך.',
      'גלול ברשימה ובחר «הוסף למסך הבית» / Add to Home Screen.',
      'הקש «הוסף» בפינה. אייקון האפליקציה יופיע במסך הבית.',
      'פתח את האפליקציה מהאייקון החדש, היכנס עם המספר האישי והקוד — ואז חזור לכאן והפעל התראות.',
    ],
  },
  android: {
    browser: 'גלקסי ואנדרואיד · Chrome',
    steps: [
      'פתח את האתר ב-Chrome.',
      'הקש על הכפתור «התקן את האפליקציה» למעלה — או על ⋮ בפינה העליונה.',
      'בחר «התקן אפליקציה» / «הוסף למסך הבית».',
      'אשר «התקן». האייקון יופיע במסך הבית ובמגירת האפליקציות.',
      'פתח את האפליקציה מהאייקון, ואז הפעל את ההתראות בכפתור שלמטה.',
    ],
  },
};

export function InstallPanel() {
  const { db, toast } = useApp();
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [tab, setTab] = useState<Exclude<Platform, 'desktop'>>('android');
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [wrongBrowser, setWrongBrowser] = useState(false);

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
    setTab(p === 'ios' ? 'ios' : 'android');
    setInstalled(isStandalone());
    setWrongBrowser(isIosNonSafari());
    const sync = () => {
      setCanPrompt(canPromptInstall());
      setInstalled(isStandalone());
    };
    sync();
    return onInstallChange(sync);
  }, []);

  const install = async () => {
    const accepted = await promptInstall();
    setCanPrompt(canPromptInstall());
    toast(accepted ? 'האפליקציה הותקנה — פתח אותה מהאייקון' : 'ההתקנה בוטלה');
  };

  const guide = STEPS[tab];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <SectionCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Image src="/icon-192.png" alt="" width={54} height={54} style={{ borderRadius: 12 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="card-title" style={{ fontSize: 16 }}>
              {db?.settings.app_name ?? 'כשירות חפ״ק מח״ט 300'}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--color-neutral-500)' }}>
              התקנה על הטלפון — בלי חנות אפליקציות, בלי הרשמה נוספת. אותו חשבון, אותו קוד.
            </span>
          </div>
        </div>

        {installed ? (
          <div
            className="tag tag-accent"
            style={{ alignSelf: 'flex-start', fontSize: 12.5, marginTop: 4 }}
          >
            ✓ האפליקציה כבר מותקנת במכשיר הזה
          </div>
        ) : canPrompt ? (
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => void install()}>
            התקן את האפליקציה עכשיו
          </button>
        ) : null}

        {wrongBrowser && (
          <span style={{ fontSize: 12, color: 'var(--color-accent-300)', lineHeight: 1.6 }}>
            אתה גולש באייפון בדפדפן שאינו Safari. העתק את הכתובת ופתח אותה ב-Safari — רק משם אפשר
            להוסיף למסך הבית ולקבל התראות.
          </span>
        )}
      </SectionCard>

      <SectionCard title="הוראות התקנה">
        <div style={{ display: 'flex', gap: 8 }}>
          {(['ios', 'android'] as const).map((k) => (
            <button
              key={k}
              className={`btn ${tab === k ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 12.5 }}
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
            >
              {k === 'ios' ? 'אייפון' : 'גלקסי / אנדרואיד'}
            </button>
          ))}
        </div>

        <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
          {guide.browser}
          {platform !== 'desktop' && tab !== platform ? ' · לא המכשיר שבידך כרגע' : ''}
        </span>

        <ol style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {guide.steps.map((s, i) => (
            <li key={i} style={{ fontSize: 13, lineHeight: 1.65 }}>
              {s}
            </li>
          ))}
        </ol>

        {platform === 'desktop' && (
          <span style={{ fontSize: 12, color: 'var(--color-neutral-500)', lineHeight: 1.6 }}>
            אתה במחשב. פתח את אותה כתובת בטלפון — או שלח אותה לעצמך בוואטסאפ — ובצע שם את השלבים.
          </span>
        )}
      </SectionCard>

      <SectionCard title="התראות לטלפון">
        <span style={{ fontSize: 12.5, color: 'var(--color-neutral-400)', lineHeight: 1.6 }}>
          ההתראות מגיעות למסך הנעילה גם כשהאפליקציה סגורה: תזכורת בערב שלפני האימון, תזכורת בבוקר
          שעתיים לפני היציאה, אישור נוכחות, ושינוי או דחייה של אימון. איזה מהן לקבל — נקבע בפרופיל,
          בהגדרות ההתראות.
        </span>
        <PushToggle />
      </SectionCard>
    </div>
  );
}
