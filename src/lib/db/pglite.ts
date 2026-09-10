import { PGlite } from "@electric-sql/pglite";
import type { Db, Row } from "./port";

/**
 * Postgres compiled to WebAssembly, running in this process.
 *
 * Used by the test suite and by `npm run dev` when no `DATABASE_URL` is set,
 * so the same SQL that ships is the SQL under test. In-memory by default;
 * pass a directory to keep a development database between runs.
 */
export function createPgliteDb(dataDir?: string): Db {
  const pg = new PGlite(dataDir);

  type Handle = {
    query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec?: (text: string) => Promise<unknown>;
  };

  const wrap = (handle: Handle, inTransaction = false): Db => ({
    async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
      const result = await handle.query(text, params);
      return result.rows as T[];
    },
    async exec(text: string): Promise<void> {
      // Inside a transaction PGlite exposes no `exec`; the simple protocol is
      // only on the top-level handle, and statements there already run in one.
      if (handle.exec) await handle.exec(text);
      else await handle.query(text);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      // PGlite has one connection and no nested transactions: opening a second
      // from inside the first waits forever for a connection that is already
      // busy. So a nested call joins the transaction already running.
      //
      // That differs from postgres.js, which uses a real savepoint. The
      // consequence is that an inner rollback here undoes the outer work too —
      // acceptable because nothing in this app wants partial rollback, and far
      // better than hanging.
      if (inTransaction) return fn(wrap(handle, true));
      return pg.transaction(async (tx) => fn(wrap(tx as Handle, true))) as Promise<T>;
    },
    async close() {
      await pg.close();
    },
  });

  return wrap(pg);
}
