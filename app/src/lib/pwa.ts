'use client';

/**
 * Installing the app on a phone.
 *
 * Android fires `beforeinstallprompt` once, early — usually before any page of
 * ours has mounted — so the listener is attached the moment this module loads
 * and the event is held here until the install screen asks for it. iOS never
 * fires it: Safari installs only through Share → Add to Home Screen, which is
 * why the install screen shows written steps as well as a button.
 */

export type Platform = 'ios' | 'android' | 'desktop';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

const announce = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep Chrome's own mini-bar away; we offer the button
    deferred = e as InstallPromptEvent;
    announce();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    announce();
  });
}

/** Subscribe to changes in install availability. Returns an unsubscribe. */
export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when Android has offered us a real one-tap install. */
export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** Shows Android's install dialog. Resolves true if the app was installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  announce();
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}

/** True when the app is running from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (installed) return true;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone === true;
}

/** Which set of instructions to show first. */
export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac; the touch points give it away
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** iOS only accepts Add to Home Screen from Safari itself. */
export function isIosNonSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (!/iPhone|iPad|iPod/.test(ua)) return false;
  return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}
