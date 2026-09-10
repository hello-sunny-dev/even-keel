import { afterEach, describe, expect, it } from "vitest";
import { categoryBreakdown, effectiveKind, monthlySummary, type Txn } from "@/lib/aggregate";
import { CATEGORIES, type Categories } from "@/lib/categories";
import { toInsertable, type ProposedTransaction } from "@/lib/ingest";
import { categoryMap, insertTransactions, listTransactions } from "@/lib/db/queries";
import type { Db } from "@/lib/db/port";
import { freshDb, txn } from "./support/db";

const SEED: Categories = new Map(CATEGORIES.map((c) => [c.id, c]));

let open: Db | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

/**
 * A $60 supermarket return is a positive amount in an expense category. Read
 * off the sign, it becomes income: the month's income rises, core income
 * rises with it, and every scenario in the ladder is scored against money
 * nobody earned.
 */
describe("a refund is not income", () => {
  const spend: Txn = {
    id: "a",
    date: "2025-03-05",
    month: "2025-03",
    description: "WOOLWORTHS PERTH",
    amount: -184.55,
    kind: "expense",
    categoryId: "food-groceries",
    oneOffOverride: null,
    needsReview: false,
    isSplitParent: false,
  };
  const refund: Txn = {
    ...spend,
    id: "b",
    description: "WOOLWORTHS PERTH REFUND",
    amount: 60,
  };
  const salary: Txn = {
    ...spend,
    id: "c",
    description: "EMPLOYER PAY",
    amount: 6200,
    kind: "income",
    categoryId: "income-salary",
  };

  it("nets against the category it was refunded from", () => {
    const rows = categoryBreakdown([spend, refund, salary], "2025-03", SEED);
    const groceries = rows.find((r) => r.categoryId === "food-groceries");

    expect(groceries?.actual).toBe(124.55);
    // Still absent from the breakdown, which is a table of spending.
    expect(rows.some((r) => r.categoryId === "income-salary")).toBe(false);
  });

  it("leaves income alone and reduces the month's spending", () => {
    const s = monthlySummary([spend, refund, salary], "2025-03", SEED);

    expect(s.totalIncome).toBe(6200);
    expect(s.coreIncome).toBe(6200);
    expect(s.totalSpent).toBe(124.55);
    // What was actually kept is the same either way — which is exactly why
    // reading the sign is easy to leave in place unnoticed.
    expect(s.actualSaved).toBe(6075.45);
  });

  it("does not turn a whole category positive into income when over-refunded", () => {
    const big: Txn = { ...refund, amount: 300 };
    const s = monthlySummary([spend, big, salary], "2025-03", SEED);

    expect(s.totalIncome).toBe(6200);
    expect(s.totalSpent).toBe(-115.45);
  });
});

describe("a transfer is neither", () => {
  const toSavings: Txn = {
    id: "t",
    date: "2025-03-20",
    month: "2025-03",
    description: "TRANSFER TO SAVINGS",
    amount: -500,
    kind: "transfer",
    categoryId: null,
    oneOffOverride: null,
    needsReview: false,
    isSplitParent: false,
  };

  it("is left out of both income and spending", () => {
    const s = monthlySummary([toSavings], "2025-03", SEED);

    expect(s.totalIncome).toBe(0);
    expect(s.totalSpent).toBe(0);
    expect(s.actualSaved).toBe(0);
  });

  it("stays a transfer even when it carries a spending category", () => {
    const kind = effectiveKind({ ...toSavings, categoryId: "food-groceries" }, SEED);
    expect(kind).toBe("transfer");
  });
});

describe("what the importer stamps", () => {
  it("takes kind from the category, not from the request", () => {
    const row: ProposedTransaction = {
      sourceFingerprint: "f1",
      date: "2025-03-05",
      month: "2025-03",
      description: "WOOLWORTHS PERTH REFUND",
      merchantKey: "WOOLWORTHS PERTH",
      amount: 60,
      balance: null,
      categoryId: "food-groceries",
      oneOff: false,
      // What a client that decided from the sign would send.
      kind: "income",
      sourceFile: "statement.pdf",
      duplicate: false,
      include: true,
    };

    expect(toInsertable([row], "pdf", SEED)[0].kind).toBe("expense");
  });
});

describe("the database refuses what the sign cannot express", () => {
  it("rejects income that is not money coming in", async () => {
    const { db, household } = await freshDb();
    open = db;

    await expect(
      insertTransactions(db, household, [
        txn({ kind: "income", amount: -6200, categoryId: "income-salary" }),
      ]),
    ).rejects.toThrow(/transactions_income_is_positive/);
  });

  it("accepts a refund, which is an expense that went the other way", async () => {
    const { db, household } = await freshDb();
    open = db;

    await insertTransactions(db, household, [
      txn({ kind: "expense", amount: 60, sourceFingerprint: "refund-1" }),
    ]);

    const rows = await listTransactions(db, household);
    expect(monthlySummary(rows, "2025-03", await categoryMap(db, household)).totalIncome).toBe(0);
  });
});
