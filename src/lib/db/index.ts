import { createPgliteDb } from "./pglite";
import type { Db } from "./port";

export type { Db, Row } from "./port";

let instance: Db | null = null;

export const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

/**
 * Opened on first use, so the app builds and renders a setup screen when no
 * database is configured rather than crashing at import time.
 *
 * With no `DATABASE_URL` this is PGlite — the same Postgres the tests run
 * against — which means `npm run dev` works on a fresh clone with no setup.
 */
export async function db(): Promise<Db> {
  if (instance) return instance;

  if (DATABASE_URL) {
    const { createPostgresDb } = await import("./postgres");
    instance = createPostgresDb(DATABASE_URL);
  } else {
    instance = createPgliteDb(process.env.PGLITE_DIR || undefined);
  }

  return instance;
}

/** Tests and scripts hand in their own database. */
export function setDb(next: Db | null): void {
  instance = next;
}
