/**
 * One narrow database interface, two implementations.
 *
 * Production runs on hosted Postgres through postgres.js; tests run on PGlite,
 * which is Postgres compiled to WebAssembly, in process, with no server. The
 * point is that the interesting bugs — deduplication, splits, remembered
 * rules, tenancy scoping — live in SQL, and mocking the database would only
 * ever test the mock.
 *
 * The two drivers disagree in three ways that a naive wrapper would hide, so
 * this file states the rules the implementations must follow.
 */

export type Row = Record<string, unknown>;

export interface Db {
  /**
   * Parameterised SQL. Placeholders are `$1`, `$2`, … in both drivers.
   *
   * **Cast at the boundary.** postgres.js returns `numeric` as a string and
   * `date` as a `Date`; PGlite returns `int8` as a BigInt and handles dates
   * differently again. A `query<T>` generic would simply lie about what came
   * back. Every query casts — `amount::float8`, `txn_date::text`,
   * `count(*)::int` — so the shape is the driver's problem, not the caller's.
   */
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;

  /**
   * Run a script of several statements.
   *
   * Separate from `query` because the extended protocol both drivers use for
   * parameters accepts exactly one statement — PGlite rejects a migration file
   * outright with "cannot insert multiple commands into a prepared statement".
   * Takes no parameters, and is only ever handed SQL from the repository.
   */
  exec(text: string): Promise<void>;

  /**
   * Run several statements atomically.
   *
   * **Use the handle passed in, never the outer one.** On postgres.js the
   * outer handle takes a different pooled connection, so the statement quietly
   * runs outside the transaction and is not rolled back. On PGlite there is
   * only one connection, so the same mistake deadlocks instead. Neither
   * failure looks like a mistake in the callback.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;

  close(): Promise<void>;
}

/** Marks a value as already-escaped SQL rather than a parameter. */
export function placeholders(count: number, offset = 0): string {
  return Array.from({ length: count }, (_, i) => `$${i + 1 + offset}`).join(", ");
}
