import "server-only";
import { join } from "node:path";
import { db } from "./db";
import { migrate } from "./db/migrate";
import type { Db } from "./db/port";
import { createHousehold, firstHouseholdId, seedCategories } from "./db/queries";

/**
 * The one household, created on first use.
 *
 * There is exactly one for now, but every query is scoped by its id, so the
 * day there are two is a change to this function rather than to every query.
 */
// Same reasoning as the database handle: a module-level cache becomes several
// across Next's bundles, and each would run the migrations again.
const READY = Symbol.for("even-keel.household");
type Registry = { [READY]?: Promise<{ db: Db; household: string }> | null };

async function open() {
  const handle = await db();
  await migrate(handle, join(process.cwd(), "db", "migrations"));

  let household = await firstHouseholdId(handle);
  if (!household) {
    household = await createHousehold(handle, "Household");
    await seedCategories(handle, household);
  }

  return { db: handle, household };
}

export function household(): Promise<{ db: Db; household: string }> {
  const registry = globalThis as Registry;
  registry[READY] ??= open().catch((error) => {
    // A failed setup must not be cached, or every later request inherits it.
    registry[READY] = null;
    throw error;
  });
  return registry[READY]!;
}
