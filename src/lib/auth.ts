/**
 * Session tokens, and only session tokens.
 *
 * This module runs in the edge proxy as well as on the server, so it uses Web
 * Crypto and never touches the database. Password hashing and account lookups
 * live in `auth-server.ts`, which is Node-only.
 *
 * The token carries the user id and the session version it was issued with.
 * Bumping a user's `session_version` therefore invalidates every token they
 * hold, without the proxy needing a database round trip on every request —
 * the version is re-checked against the database on writes.
 */

export const SESSION_COOKIE = "ek_session";
const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

export type SessionClaims = {
  userId: string;
  version: number;
};

// A fresh clone has no `.env.local`, and the first thing anyone does is sign
// in. Failing that with a 500 teaches nothing, so development falls back to a
// fixed string — which is not a secret, and is why production still refuses.
const DEV_SECRET = "even-keel-development-only-not-a-secret";

function secret(): string {
  const value = process.env.SESSION_SECRET ?? "";
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set — sessions cannot be signed.");
  }
  return DEV_SECRET;
}

const encoder = new TextEncoder();

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent comparison — no early exit on the first differing byte. */
export function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function createSessionToken(claims: SessionClaims, now = Date.now()): Promise<string> {
  const expires = now + SESSION_MAX_AGE * 1000;
  const payload = `${claims.userId}.${claims.version}.${expires}`;
  return `${payload}.${await sign(payload)}`;
}

export async function readSessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<SessionClaims | null> {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;

  const [userId, versionRaw, expiresRaw, signature] = parts;
  const expires = Number(expiresRaw);
  const version = Number(versionRaw);
  if (!Number.isFinite(expires) || !Number.isFinite(version)) return null;
  if (expires < now) return null;

  const expected = await sign(`${userId}.${versionRaw}.${expiresRaw}`);
  if (!timingSafeEqual(signature, expected)) return null;

  return { userId, version };
}

export function isSessionSecretConfigured(): boolean {
  return Boolean(process.env.SESSION_SECRET);
}
