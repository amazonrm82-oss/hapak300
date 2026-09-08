import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security headers, with a per-request nonce for the Content-Security-Policy.
 *
 * The CSP is the part that matters: it names the only places a script may come
 * from and the only places the page may talk to. If unit data ever carried
 * markup that reached the DOM, this is what stops it turning into code — and it
 * stops a stolen session being posted anywhere, since the app may only reach
 * its own Supabase project.
 *
 * Next.js picks the nonce up from this header and stamps it on its own inline
 * bootstrap scripts, so no `unsafe-inline` is needed for scripts. Styles are a
 * different matter: the app styles almost everything with inline `style`
 * attributes and styled-jsx, which a nonce cannot cover, so `style-src` keeps
 * `unsafe-inline`. Injected CSS cannot execute.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // the browser talks to Supabase directly: REST, auth, storage and the
  // realtime socket, all on the project's own host
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  let sbHost = '';
  try {
    sbHost = supabase ? new URL(supabase).origin : '';
  } catch {
    /* misconfigured URL — the app will say so on its own */
  }
  // realtime connects over a websocket to the same host; deriving the scheme
  // only from https left a local http Supabase blocked by this very policy
  const sbSocket = sbHost.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');

  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    // הגופנים נבנים לתוך האתר, ולכן אין כאן שום צד שלישי
    `font-src 'self'`,
    `img-src 'self' data: blob: ${sbHost}`.trim(),
    `connect-src 'self' ${sbHost} ${sbSocket}`.trim(),
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers } });

  response.headers.set('content-security-policy', csp);
  // clickjacking: nothing about this app should ever be framed
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('x-content-type-options', 'nosniff');
  // a training's URL should not travel to another site in a Referer header
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()',
  );
  response.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('x-dns-prefetch-control', 'off');

  return response;
}

export const config = {
  // everything except Next's own static output and the icons, which carry no
  // markup and are served straight from the CDN
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.webmanifest$|sw\\.js).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
