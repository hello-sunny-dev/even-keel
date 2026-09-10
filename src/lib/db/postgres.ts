import "server-only";
import postgres from "postgres";
import type { Db, Row } from "./port";

/**
 * Is this a connection pooler rather than the database itself?
 *
 * It matters because a pooler in transaction mode — Supabase's on port 6543,
 * Neon's `-pooler` host — hands each statement to whichever backend is free,
 * so a prepared statement made on one connection is not there on the next.
 * postgres.js prepares by default, and the failure is
 * "prepared statement s1 already exists" or "does not exist" under load: it
 * works in testing and breaks when two requests overlap.
 *
 * Serverless needs the pooler — a Vercel function per request would exhaust
 * direct connections — so the answer is to stop preparing, not to avoid it.
 */
export function isPooled(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("pgbouncer=true") ||
    lower.includes("pooler.supabase.com") ||
    /-pooler\./.test(lower) ||
    /:6543(\/|\?|$)/.test(lower)
  );
}

/** Hosted Postgres, for production. */
export function createPostgresDb(url: string): Db {
  const local = url.includes("localhost") || url.includes("127.0.0.1");
  const sql = postgres(url, {
    max: 3,
    idle_timeout: 20,
    ssl: local ? false : "require",
    prepare: !isPooled(url),
    // Statement text carries merchant names; never let the driver echo
    // parameters into the logs.
    debug: false,
    onnotice: () => {},
  });

  const wrap = (handle: postgres.Sql | postgres.TransactionSql): Db => ({
    async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await handle.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
    async exec(text: string): Promise<void> {
      // `.simple()` drops to the simple query protocol, which is the one that
      // accepts more than a single statement.
      await handle.unsafe(text).simple();
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      // Nested calls become savepoints; postgres.js exposes `begin` only on
      // the top-level handle.
      const top = handle as postgres.Sql;
      if (typeof top.begin === "function") {
        return top.begin((tx: postgres.TransactionSql) => fn(wrap(tx))) as Promise<T>;
      }
      const inner = handle as postgres.TransactionSql;
      return inner.savepoint((sp: postgres.TransactionSql) => fn(wrap(sp))) as Promise<T>;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  });

  return wrap(sql);
}
