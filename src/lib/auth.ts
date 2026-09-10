/**
 * A single shared password for exactly two people. No registration, no
 * accounts, no password reset — anything more would be more attack surface,
 * not less.
 *
 * Runs on the edge runtime (middleware), so Web Crypto only.
 */

export const SESSION_COOKIE = "hft_session";
const SESSION_DAYS = 30;

function secret(): string {
  const value = process.env.SESSION_SECRET || process.env.APP_PASSWORD || "";
  if (!value) throw new Error("APP_PASSWORD is not set — the app refuses to run unauthenticated.");
  return value;
}

export function isConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

/**
 * Running locally with no password set, the gate stands aside so a fresh
 * clone works. In production the same absence locks everything instead —
 * an unset secret must never be the thing that opens the door.
 */
export function isOpenForDevelopment(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.APP_PASSWORD;
}

const encoder = new TextEncoder();

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent comparison — no early exit on the first differing byte. */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return false;
  // Hash both sides first so the comparison never runs over raw secrets of
  // differing length.
  const [a, b] = await Promise.all([hmac(`pw:${candidate}`), hmac(`pw:${expected}`)]);
  return timingSafeEqual(a, b);
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${await hmac(String(expires))}`;
}

export async function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const [expiresRaw, signature] = token.split(".");
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || !signature) return false;
  if (expires < now) return false;
  return timingSafeEqual(signature, await hmac(expiresRaw));
}

export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
