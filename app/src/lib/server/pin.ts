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
/**
 * Four digits is 10,000 possibilities, and people do not pick from them evenly:
 * a handful of codes cover a large share of every real-world sample. Blocking
 * them costs a fighter nothing and removes the guesses an attacker would make
 * first — which matters here, because five tries are allowed before the lock.
 */
const COMMON_PINS = new Set([
  '1234', '1111', '0000', '1212', '7777', '1004', '2000', '4444', '2222', '6969',
  '9999', '3333', '5555', '6666', '1122', '1313', '8888', '4321', '2001', '1010',
  '1230', '2580', '0852', '1235', '9876', '1998', '1999', '2020', '2021', '2022',
  '2023', '2024', '2025',
]);

export function isWeakPin(pin: string): boolean {
  if (COMMON_PINS.has(pin)) return true;
  if (/^(\d)\1{3}$/.test(pin)) return true; // 0000, 7777 …
  // four in a row, up or down: 2345, 8765
  const d = pin.split('').map(Number);
  const step = d[1] - d[0];
  if ((step === 1 || step === -1) && d[2] - d[1] === step && d[3] - d[2] === step) return true;
  // two repeated pairs: 1212, 4545
  if (d[0] === d[2] && d[1] === d[3]) return true;
  return false;
}
