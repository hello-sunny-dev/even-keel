import { afterEach, describe, expect, it } from "vitest";
import { categoryBreakdown, monthlySummary, type Txn } from "@/lib/aggregate";
import {
  categoryMap,
  insertTransactions,
  listTransactions,
  setCategorySettings,
} from "@/lib/db/queries";
import type { Db } from "@/lib/db/port";
import { freshDb, txn } from "./support/db";

let open: Db | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

/**
 * The settings screen writes `one_off`, `name` and cadence to the categories
 * table. If the aggregates resolve those from the seed array instead, every
 * one of these assertions passes with a stale answer and the toggle does
 * nothing that any total can see.
 */
describe("the aggregates read the household's own categories", () => {
  it("moves one-off spending when the flag is flipped in the database", async () => {
    const { db, household } = await freshDb();
    open = db;
    await insertTransactions(db, household, [
      txn({ description: "WOOLWORTHS PERTH", amount: -184.55, categoryId: "food-groceries" }),
    ]);
    const rows: Txn[] = await listTransactions(db, household);

    const before = monthlySummary(rows, "2025-03", await categoryMap(db, household));
    expect(before.oneOffSpent).toBe(0);
    expect(before.recurringSpent).toBe(184.55);

    await setCategorySettings(db, household, "food-groceries", { oneOff: true });

    const after = monthlySummary(rows, "2025-03", await categoryMap(db, household));
    expect(after.oneOffSpent).toBe(184.55);
    expect(after.recurringSpent).toBe(0);
    // The month itself did not change — only what the household calls one-off.
    expect(after.totalSpent).toBe(before.totalSpent);
  });

  it("shows a renamed category by its new name", async () => {
    const { db, household } = await freshDb();
    open = db;
    await insertTransactions(db, household, [txn({ categoryId: "food-groceries" })]);
    const rows: Txn[] = await listTransactions(db, household);

    await setCategorySettings(db, household, "food-groceries", { name: "Supermarket" });

    const breakdown = categoryBreakdown(rows, "2025-03", await categoryMap(db, household));
    expect(breakdown.find((r) => r.categoryId === "food-groceries")?.name).toBe("Supermarket");
  });

  it("counts a category the household created, which no seed array knows about", async () => {
    const { db, household } = await freshDb();
    open = db;
    await db.query(
      `insert into categories (id, household_id, name, "group", kind, one_off)
       values ('boat-fund', $1, 'Boat Fund', 'One-off', 'expense', true)`,
      [household],
    );
    await insertTransactions(db, household, [
      txn({ description: "MARINA FEES", amount: -900, categoryId: "boat-fund" }),
    ]);
    const rows: Txn[] = await listTransactions(db, household);

    const categories = await categoryMap(db, household);
    expect(monthlySummary(rows, "2025-03", categories).oneOffSpent).toBe(900);
    expect(categoryBreakdown(rows, "2025-03", categories)[0]).toMatchObject({
      categoryId: "boat-fund",
      name: "Boat Fund",
      actual: 900,
    });
  });
});
