import { createHmac, pbkdf2 as pbkdf2Cb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * PIN hashing — server side only. Never import this from a client component.
 *
 * PBKDF2-SHA256 at OWASP's 2023 iteration count, with a random per-user salt
 * and a server-side pepper. A four-digit PIN has 10,000 possibilities, so no
 * KDF makes it brute-force proof on its own: the pepper is what stops an
 * attacker holding a copy of the database from testing candidates offline, and
 * the login throttle is what stops them testing online.
 *
 * Format: `pbkdf2$<iterations>$<salt-b64>$<hash-b64>`
 */

const pbkdf2 = promisify(pbkdf2Cb);
const ITERATIONS = 210_000;
const KEY_LEN = 32;

function pepper(): string {
  const p = process.env.PIN_PEPPER;
  if (!p) throw new Error('PIN_PEPPER is not configured');
  return p;
}

async function derive(pin: string, salt: Buffer, iterations: number): Promise<Buffer> {
  return pbkdf2(pin + pepper(), salt, iterations, KEY_LEN, 'sha256');
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(pin, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, iterStr, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await derive(pin, Buffer.from(saltB64, 'base64'), Number(iterStr));
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * The Supabase Auth password for a person: derived on the server from their id
 * and a secret, never the PIN itself. Knowing someone's PIN is therefore not
 * enough to authenticate anywhere except through these routes.
 */
export function authPassword(personId: string): string {
  const secret = process.env.AUTH_DERIVE_SECRET;
  if (!secret) throw new Error('AUTH_DERIVE_SECRET is not configured');
  return createHmac('sha256', secret).update(personId).digest('base64');
}

export const syntheticEmail = (pn: string) => `${pn}@hapak300.local`;

/** Blocks the obvious codes: 1234 and any repeated digit. */
export function isWeakPin(pin: string): boolean {
  return pin === '1234' || /^(\d)\1{3}$/.test(pin);
}
