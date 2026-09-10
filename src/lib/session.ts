import "server-only";
import { join } from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, readSessionToken } from "./auth";
import { findAccountById, type Account } from "./auth-server";
import { db } from "./db";
import { migrate } from "./db/migrate";
import type { Db } from "./db/port";

/**
 * The database, migrated once per process.
 *
 * Pinned to a global rather than a module variable: Next bundles pages and
 * route handlers separately and re-evaluates modules on hot reload, so a
 * module-level cache becomes several, and each would run the migrations again.
 */
const READY = Symbol.for("even-keel.ready");
type Registry = { [READY]?: Promise<Db> | null };

async function open(): Promise<Db> {
  const handle = await db();
  await migrate(handle, join(process.cwd(), "db", "migrations"));
  return handle;
}

export function database(): Promise<Db> {
  const registry = globalThis as Registry;
  registry[READY] ??= open().catch((error) => {
    // A failed setup must not be cached, or every later request inherits it.
    registry[READY] = null;
    throw error;
  });
  return registry[READY]!;
}

export type Session = { db: Db; account: Account; household: string };

/**
 * The signed-in account, or null.
 *
 * The token already proved itself in the proxy; this re-reads the account so
 * the session version can be checked against the database. A password change
 * bumps that version, and every token issued before it stops working here.
 */
export async function currentSession(): Promise<Session | null> {
  const handle = await database();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await readSessionToken(token).catch(() => null);
  if (!claims) return null;

  const account = await findAccountById(handle, claims.userId);
  if (!account || account.sessionVersion !== claims.version) return null;

  return { db: handle, account, household: account.householdId };
}

/**
 * For pages behind the gate.
 *
 * The proxy has already turned away anyone with no token or a forged one. What
 * reaches here and still fails is a token whose session version no longer
 * matches — someone whose password was changed from another device. That is a
 * sign-in prompt, not a crash, so it redirects rather than throwing.
 */
export async function requireSession(): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session;
}
