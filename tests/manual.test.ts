import { afterEach, describe, expect, it } from "vitest";
import { monthlySummary, type Txn } from "@/lib/aggregate";
import {
  categoriesWithHistory,
  categoryMap,
  insertTransactions,
  listTransactions,
  monthTotals,
  replaceMonthTotals,
} from "@/lib/db/queries";
import type { Db } from "@/lib/db/port";
import { freshDb, txn } from "./support/db";

let open: Db | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

function monthRow(month: string, categoryId: string, amount: number) {
  return txn({
    date: `${month}-01`,
    month,
    description: `${categoryId} — month total`,
    merchantKey: "",
    amount,
    categoryId,
    source: "manual",
    granularity: "month",
    sourceFingerprint: `month:${month}:${categoryId}`,
  });
}

describe("a hand-entered month", () => {
  it("counts in the totals but stays out of the ledger", async () => {
    const { db, household } = await freshDb();
    open = db;

    await insertTransactions(db, household, [txn({ amount: -184.55 })]);
    await replaceMonthTotals(db, household, "2025-03", [
      monthRow("2025-03", "utilities-electricity", -320),
    ]);

    const everything: Txn[] = await listTransactions(db, household);
    const ledger = await listTransactions(db, household, { granularity: "transaction" });

    expect(everything).toHaveLength(2);
    expect(ledger).toHaveLength(1);
    // The figure is real: it belongs in the month whether or not it has a
    // receipt behind it.
    expect(monthlySummary(everything, "2025-03", await categoryMap(db, household)).totalSpent).toBe(
      504.55,
    );
  });

  it("is replaced when the month is entered again, not added to", async () => {
    const { db, household } = await freshDb();
    open = db;

    await replaceMonthTotals(db, household, "2025-03", [
      monthRow("2025-03", "utilities-electricity", -320),
      monthRow("2025-03", "food-groceries", -900),
    ]);
    await replaceMonthTotals(db, household, "2025-03", [
      monthRow("2025-03", "utilities-electricity", -350),
    ]);

    const totals = await monthTotals(db, household, "2025-03");
    expect(totals).toEqual([{ categoryId: "utilities-electricity", amount: -350 }]);
  });

  it("leaves an imported statement in the same month alone", async () => {
    const { db, household } = await freshDb();
    open = db;

    await insertTransactions(db, household, [txn({ amount: -184.55 })]);
    await replaceMonthTotals(db, household, "2025-03", [
      monthRow("2025-03", "utilities-electricity", -320),
    ]);
    await replaceMonthTotals(db, household, "2025-03", []);

    const ledger = await listTransactions(db, household, { granularity: "transaction" });
    expect(ledger).toHaveLength(1);
    expect(await monthTotals(db, household, "2025-03")).toEqual([]);
  });

  it("does not disturb a different month", async () => {
    const { db, household } = await freshDb();
    open = db;

    await replaceMonthTotals(db, household, "2025-03", [
      monthRow("2025-03", "food-groceries", -900),
    ]);
    await replaceMonthTotals(db, household, "2025-04", [
      monthRow("2025-04", "food-groceries", -950),
    ]);

    expect(await monthTotals(db, household, "2025-03")).toHaveLength(1);
    expect(await monthTotals(db, household, "2025-04")).toHaveLength(1);
  });
});

describe("the month form's shortlist", () => {
  it("is the categories this household actually uses, most first", async () => {
    const { db, household } = await freshDb();
    open = db;

    await insertTransactions(db, household, [
      txn({ categoryId: "food-groceries", sourceFingerprint: "a" }),
      txn({ categoryId: "food-groceries", sourceFingerprint: "b" }),
      txn({ categoryId: "food-groceries", sourceFingerprint: "c" }),
      txn({ categoryId: "utilities-electricity", sourceFingerprint: "d" }),
      txn({ categoryId: "utilities-electricity", sourceFingerprint: "e" }),
      txn({ categoryId: "sub-netflix", sourceFingerprint: "f" }),
    ]);

    expect(await categoriesWithHistory(db, household)).toEqual([
      "food-groceries",
      "utilities-electricity",
      "sub-netflix",
    ]);
  });

  it("is empty for a household that has entered nothing", async () => {
    const { db, household } = await freshDb();
    open = db;

    expect(await categoriesWithHistory(db, household)).toEqual([]);
  });
});
