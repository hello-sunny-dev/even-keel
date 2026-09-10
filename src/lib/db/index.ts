import { createPgliteDb } from "./pglite";
import type { Db } from "./port";

export type { Db, Row } from "./port";

/**
 * Pinned to the global, not to a module variable.
 *
 * Next bundles pages and route handlers separately and re-evaluates modules on
 * every hot reload, so a module-level singleton becomes several. With Postgres
 * that is a few extra pools; with PGlite it is several databases over one
 * directory, each holding its own state — an import through a route handler
 * lands in one and the page renders from another, which looks exactly like the
 * write silently failing.
 */
const GLOBAL_KEY = Symbol.for("even-keel.db");
type Registry = { [GLOBAL_KEY]?: Db | null };

function cached(): Db | null {
  return (globalThis as Registry)[GLOBAL_KEY] ?? null;
}

function remember(next: Db | null): void {
  (globalThis as Registry)[GLOBAL_KEY] = next;
}

export const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

/**
 * Opened on first use, so the app builds and renders a setup screen when no
 * database is configured rather than crashing at import time.
 *
 * With no `DATABASE_URL` this is PGlite — the same Postgres the tests run
 * against — which means `npm run dev` works on a fresh clone with no setup.
 */
export async function db(): Promise<Db> {
  const existing = cached();
  if (existing) return existing;

  const next = DATABASE_URL
    ? (await import("./postgres")).createPostgresDb(DATABASE_URL)
    : createPgliteDb(process.env.PGLITE_DIR || undefined);

  remember(next);
  return next;
}

/** Tests and scripts hand in their own database. */
export function setDb(next: Db | null): void {
  remember(next);
}
