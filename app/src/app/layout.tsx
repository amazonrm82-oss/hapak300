import type { Metadata, Viewport } from 'next';
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#141a0e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html dir="rtl" lang="he">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
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
