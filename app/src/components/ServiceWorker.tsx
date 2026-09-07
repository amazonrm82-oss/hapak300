'use client';

import { useEffect } from 'react';

/** Registers the service worker so the app can be installed to the home screen. */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* installation is a nicety; the app works without it */
    });
  }, []);
  return null;
}
