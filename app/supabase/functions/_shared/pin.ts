/**
 * PIN hashing.
 *
 * PBKDF2-SHA256 at OWASP's 2023 iteration count, with a random per-user salt
 * and a server-side pepper (`PIN_PEPPER`) that lives only in the function's
 * environment. A four-digit PIN has 10,000 possibilities, so no KDF makes it
 * brute-force proof on its own — the pepper is what stops an attacker who has
 * a copy of the database from testing candidates offline, and the login
 * throttle is what stops them testing online.
 *
 * Format: `pbkdf2$<iterations>$<salt-b64>$<hash-b64>`
 */

const ITERATIONS = 210_000;
const KEY_LEN = 32;

const enc = new TextEncoder();

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function pepper(): string {
  const p = Deno.env.get('PIN_PEPPER');
  if (!p) throw new Error('PIN_PEPPER is not configured');
  return p;
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin + pepper()), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, KEY_LEN * 8);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(pin, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt.buffer)}$${b64(bits)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, iterStr, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const bits = await derive(pin, unb64(saltB64), Number(iterStr));
  const a = new Uint8Array(bits);
  const b = unb64(hashB64);
  if (a.length !== b.length) return false;
  // constant time: never leak how much of the hash matched
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * The Supabase Auth password for a person. Derived on the server from their id
 * and a secret — never the PIN itself, so knowing the PIN is not enough to
 * authenticate anywhere except through these functions.
 */
export async function authPassword(personId: string): Promise<string> {
  const secret = Deno.env.get('AUTH_DERIVE_SECRET');
  if (!secret) throw new Error('AUTH_DERIVE_SECRET is not configured');
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(personId));
  return b64(sig);
}

export const syntheticEmail = (pn: string) => `${pn}@hapak300.local`;

/** Blocks the obvious codes: 1234 and any repeated digit. */
export function isWeakPin(pin: string): boolean {
  return pin === '1234' || /^(\d)\1{3}$/.test(pin);
}
