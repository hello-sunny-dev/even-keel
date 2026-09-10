import { join } from "node:path";
import { migrate } from "@/lib/db/migrate";
import { createPgliteDb } from "@/lib/db/pglite";
import type { Db } from "@/lib/db/port";
import { createHousehold, seedCategories, type InsertableTransaction } from "@/lib/db/queries";

const MIGRATIONS = join(process.cwd(), "db", "migrations");

/** A migrated, seeded, single-household database, in memory, per test. */
export async function freshDb(): Promise<{ db: Db; household: string }> {
  const db = createPgliteDb();
  await migrate(db, MIGRATIONS);
  const household = await createHousehold(db, "Test Household");
  await seedCategories(db, household);
  return { db, household };
}

export function txn(overrides: Partial<InsertableTransaction> = {}): InsertableTransaction {
  const base: InsertableTransaction = {
    date: "2025-03-05",
    month: "2025-03",
    description: "WOOLWORTHS PERTH",
    merchantKey: "WOOLWORTHS PERTH",
    amount: -184.55,
    balance: null,
    kind: "expense",
    categoryId: "food-groceries",
    oneOffOverride: null,
    needsReview: false,
    source: "pdf",
    sourceFingerprint: "2025-03-05|WOOLWORTHS PERTH|-184.55|#1",
  };
  return { ...base, ...overrides };
}
