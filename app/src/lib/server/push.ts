/**
 * The `sub` claim on the VAPID token — who to contact about these pushes.
 *
 * Apple validates it and Google does not, which is why the same keys delivered
 * to Chrome and came back from Apple as `403 BadJwtToken`: the default was
 * `mailto:admin@hapak300.local`, and `.local` is not a domain that exists.
 *
 * So a subject is used only if it is a real `https:` URL or a `mailto:` on a
 * routable domain; otherwise the deployment's own address is used, which is
 * both true and always valid. Nothing for the unit to configure.
 */
const USABLE = (value: string): boolean => {
  const v = value.trim();
  if (v.startsWith('mailto:')) {
    const domain = v.slice(7).split('@')[1] ?? '';
    return domain.includes('.') && !/\.(local|localhost|internal|test|invalid)$/i.test(domain);
  }
  if (!v.startsWith('https://')) return false;
  try {
    const host = new URL(v).hostname;
    return host.includes('.') && !/\.(local|localhost|internal|test|invalid)$/i.test(host);
  } catch {
    return false;
  }
};

export function vapidSubject(): string {
  const configured = process.env.VAPID_SUBJECT ?? '';
  if (USABLE(configured)) return configured.trim();

  // Vercel exposes the deployment's own hostnames
  for (const host of [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]) {
    if (host && USABLE(`https://${host}`)) return `https://${host}`;
  }

  // last resort: the Supabase project, which is always set and always real
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (USABLE(supabase)) return new URL(supabase).origin;

  return 'https://vercel.com';
}
