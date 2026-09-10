import "server-only";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual as nodeTimingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Db } from "./db/port";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/** scrypt with a per-user salt. Stored as `scrypt$<salt hex>$<key hex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Hash regardless, so a missing account and a wrong password take the same
  // time and cannot be told apart by how quickly the answer comes back.
  const [scheme, saltHex, keyHex] = (stored ?? "").split("$");
  const salt = Buffer.from(saltHex ?? "00".repeat(16), "hex");
  const expected = Buffer.from(keyHex ?? "00".repeat(KEY_LENGTH), "hex");
  const actual = await scrypt(password, salt, KEY_LENGTH);

  if (scheme !== "scrypt" || expected.length !== actual.length) return false;
  return nodeTimingSafeEqual(actual, expected);
}

export type Account = {
  id: string;
  householdId: string;
  email: string;
  displayName: string;
  sessionVersion: number;
};

function toAccount(r: Record<string, unknown>): Account {
  return {
    id: String(r.id),
    householdId: String(r.household_id),
    email: String(r.email),
    displayName: String(r.display_name),
    sessionVersion: Number(r.session_version),
  };
}

const ACCOUNT_COLUMNS = `id::text, household_id::text, email, display_name, session_version::int`;

export async function countUsers(db: Db): Promise<number> {
  const rows = await db.query<{ n: number }>("select count(*)::int as n from users");
  return Number(rows[0]?.n ?? 0);
}

export async function findAccountByEmail(db: Db, email: string): Promise<Account | null> {
  const rows = await db.query<Record<string, unknown>>(
    `select ${ACCOUNT_COLUMNS} from users where lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ? toAccount(rows[0]) : null;
}

export async function findAccountById(db: Db, id: string): Promise<Account | null> {
  const rows = await db.query<Record<string, unknown>>(
    `select ${ACCOUNT_COLUMNS} from users where id = $1`,
    [id],
  );
  return rows[0] ? toAccount(rows[0]) : null;
}

export async function passwordHashFor(db: Db, id: string): Promise<string | null> {
  const rows = await db.query<{ password_hash: string | null }>(
    "select password_hash from users where id = $1",
    [id],
  );
  return rows[0]?.password_hash ?? null;
}

export async function createAccount(
  db: Db,
  input: { householdId: string; email: string; displayName: string; password: string },
): Promise<Account> {
  const hash = await hashPassword(input.password);
  const rows = await db.query<Record<string, unknown>>(
    `insert into users (household_id, email, display_name, password_hash)
     values ($1, $2, $3, $4)
     returning ${ACCOUNT_COLUMNS}`,
    [input.householdId, input.email, input.displayName, hash],
  );
  return toAccount(rows[0]);
}

/**
 * Change a password and bump the session version in one statement, so every
 * token issued against the old password stops verifying immediately.
 */
export async function changePassword(db: Db, id: string, password: string): Promise<number> {
  const hash = await hashPassword(password);
  const rows = await db.query<{ session_version: number }>(
    `update users set password_hash = $2, session_version = session_version + 1
      where id = $1 returning session_version::int`,
    [id, hash],
  );
  return Number(rows[0].session_version);
}

/* --------------------------------------------------------- rate limiting */

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 8;

export async function recordLoginAttempt(
  db: Db,
  identifier: string,
  succeeded: boolean,
): Promise<void> {
  await db.query("insert into login_attempts (identifier, succeeded) values ($1, $2)", [
    identifier.toLowerCase(),
    succeeded,
  ]);
}

/**
 * One URL and one password field is the realistic attack here, and an
 * in-memory counter would reset on every cold start — so the count lives in
 * the database.
 */
export async function isRateLimited(db: Db, identifier: string): Promise<boolean> {
  const rows = await db.query<{ n: number }>(
    `select count(*)::int as n from login_attempts
      where identifier = $1
        and not succeeded
        and attempted_at > now() - ($2 || ' minutes')::interval`,
    [identifier.toLowerCase(), String(WINDOW_MINUTES)],
  );
  return Number(rows[0]?.n ?? 0) >= MAX_FAILURES;
}

export const RATE_LIMIT = { windowMinutes: WINDOW_MINUTES, maxFailures: MAX_FAILURES };

/* ---------------------------------------------------------------- invites */

export type Invite = {
  token: string;
  kind: "join" | "new_household";
  householdId: string | null;
  note: string | null;
  expiresAt: string;
};

export async function createInvite(
  db: Db,
  input: {
    kind: "join" | "new_household";
    householdId: string | null;
    createdBy: string;
    note?: string;
    days?: number;
  },
): Promise<Invite> {
  const token = randomBytes(24).toString("base64url");
  const rows = await db.query<Record<string, unknown>>(
    `insert into invites (token, kind, household_id, created_by, note, expires_at)
     values ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval)
     returning token, kind, household_id::text, note, expires_at::text`,
    [
      token,
      input.kind,
      input.householdId,
      input.createdBy,
      input.note ?? null,
      String(input.days ?? 14),
    ],
  );
  return {
    token: String(rows[0].token),
    kind: rows[0].kind as Invite["kind"],
    householdId: (rows[0].household_id as string | null) ?? null,
    note: (rows[0].note as string | null) ?? null,
    expiresAt: String(rows[0].expires_at),
  };
}

export async function findUsableInvite(db: Db, token: string): Promise<Invite | null> {
  const rows = await db.query<Record<string, unknown>>(
    `select token, kind, household_id::text, note, expires_at::text
       from invites
      where token = $1 and accepted_at is null and expires_at > now()`,
    [token],
  );
  if (!rows[0]) return null;
  return {
    token: String(rows[0].token),
    kind: rows[0].kind as Invite["kind"],
    householdId: (rows[0].household_id as string | null) ?? null,
    note: (rows[0].note as string | null) ?? null,
    expiresAt: String(rows[0].expires_at),
  };
}

export async function markInviteAccepted(db: Db, token: string, userId: string): Promise<void> {
  await db.query("update invites set accepted_at = now(), accepted_by = $2 where token = $1", [
    token,
    userId,
  ]);
}

export async function listOpenInvites(db: Db, householdId: string): Promise<Invite[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select token, kind, household_id::text, note, expires_at::text
       from invites
      where accepted_at is null and expires_at > now()
        and (household_id = $1 or created_by in (select id from users where household_id = $1))
      order by created_at desc`,
    [householdId],
  );
  return rows.map((r) => ({
    token: String(r.token),
    kind: r.kind as Invite["kind"],
    householdId: (r.household_id as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    expiresAt: String(r.expires_at),
  }));
}

export async function revokeInvite(db: Db, token: string, householdId: string): Promise<void> {
  await db.query(
    `delete from invites
      where token = $1
        and (household_id = $2 or created_by in (select id from users where household_id = $2))`,
    [token, householdId],
  );
}

export async function listHouseholdMembers(db: Db, householdId: string): Promise<Account[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select ${ACCOUNT_COLUMNS} from users where household_id = $1 order by created_at`,
    [householdId],
  );
  return rows.map(toAccount);
}
