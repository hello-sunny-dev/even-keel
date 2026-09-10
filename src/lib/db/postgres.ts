import "server-only";
import postgres from "postgres";
import type { Db, Row } from "./port";

/** Hosted Postgres, for production. */
export function createPostgresDb(url: string): Db {
  const sql = postgres(url, {
    max: 3,
    idle_timeout: 20,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
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
