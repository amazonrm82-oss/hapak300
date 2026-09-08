import type { Metadata, Viewport } from 'next';
import { Heebo, Inter } from 'next/font/google';
import './globals.css';
import { DataProvider } from '@/lib/data/provider';
import { Toast } from '@/components/ui/Toast';
import { ServiceWorker } from '@/components/ServiceWorker';

export const metadata: Metadata = {
  title: 'כשירות חפ״ק מח״ט 300',
  description: 'תוכנית האימונים של שני צוותי החפ״ק — לו״ז, נוכחות, מדריכים ומפקדי אימון, לוגיסטיקה ותחמושת.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // iOS ignores the manifest icons and takes this one to the Home Screen
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'כשירות חפ״ק' },
};

/**
 * Rendered per request rather than prerendered, so the Content-Security-Policy
 * nonce from the middleware reaches Next's own inline scripts. A prerendered
 * page carries no nonce, and the policy would block every script on it.
 * Nothing here is static anyway — every screen is a client component reading
 * live unit data.
 */
export const dynamic = 'force-dynamic';

/**
 * The two faces, downloaded at build time and served from this site.
 *
 * They used to be fetched from Google on every load. In a room with no signal
 * — which is most of where this app is opened — that request is the one thing
 * on the screen still waiting, and it also told Google who is looking. Built in,
 * they arrive with the page, and the policy in the middleware no longer has to
 * make room for a third party.
 */
const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-heebo',
  display: 'swap',
});
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#141a0e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html dir="rtl" lang="he" className={`${inter.variable} ${heebo.variable}`}>
      <body>
        <DataProvider>
          <div className="hapak-ground" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {children}
          </div>
          <Toast />
          <ServiceWorker />
        </DataProvider>
      </body>
    </html>
  );
}
