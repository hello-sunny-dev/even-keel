import { afterEach, describe, expect, it } from "vitest";
import { monthlySummary, type Txn } from "@/lib/aggregate";
import { CATEGORIES, type Categories } from "@/lib/categories";
import { categoriseTransaction, insertTransactions, listTransactions } from "@/lib/db/queries";
import type { Db } from "@/lib/db/port";
import { proposeFrom, toInsertable } from "@/lib/ingest";
import type { ParseResult } from "@/lib/parse/statement";
import { isInternalTransfer } from "@/lib/transfers";
import { freshDb, txn } from "./support/db";

const SEED: Categories = new Map(CATEGORIES.map((c) => [c.id, c]));

let open: Db | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

function parsed(description: string, amount: number): ParseResult {
  return {
    transactions: [
      {
        date: "2025-03-05",
        month: "2025-03",
        description,
        amount,
        balance: null,
        signSource: "tail",
        sourceFingerprint: `fp-${description}`,
      },
    ],
    openingBalance: null,
    closingBalance: null,
    skipped: [],
    warnings: [],
  } as unknown as ParseResult;
}

describe("recognising a move between the household's own accounts", () => {
  it("reads the bank's own wording, as these statements write it", () => {
    for (const description of [
      "Internal Transfer - Receipt Transfer To",
      "Internal Transfer - Receipt To Everyday Account",
      "To my Savings Maximiser",
      "Repayment - Direct Credit",
    ]) {
      expect(isInternalTransfer(description), description).toBe(true);
    }
  });

  it("leaves anything it cannot be sure of alone", () => {
    // Marking a real payment as a transfer removes it from every total with
    // nothing on screen to say so. An unanswered question in the review queue
    // is visible, so ambiguity goes there.
    for (const description of [
      "Osko Payment - Receipt Transfer To Competitive Cleaning",
      "TRANSFER RECEIPT TRANSFER FROM",
      "SWIFT TRANSFER RECEIPT",
      "Visa Purchase - Receipt WOOLWORTHS NORTHSIDE",
    ]) {
      expect(isInternalTransfer(description), description).toBe(false);
    }
  });
});

describe("importing a transfer", () => {
  it("takes no category and asks no question", () => {
    const [row] = proposeFrom(
      parsed("Internal Transfer - Receipt To Everyday Account", -500),
      "s.pdf",
      SEED,
      [],
    );

    expect(row.kind).toBe("transfer");
    expect(row.categoryId).toBeNull();

    const [insertable] = toInsertable([row], "pdf", SEED);
    expect(insertable.kind).toBe("transfer");
    // The one untagged row that is not an open question.
    expect(insertable.needsReview).toBe(false);
  });

  it("is neither spending nor income in the month it lands in", () => {
    const rows: Txn[] = [
      {
        id: "1",
        date: "2025-03-05",
        month: "2025-03",
        description: "Internal Transfer - Receipt To Everyday Account",
        amount: -500,
        kind: "transfer",
        categoryId: null,
        oneOffOverride: null,
        needsReview: false,
        isSplitParent: false,
      },
      {
        id: "2",
        date: "2025-03-06",
        month: "2025-03",
        description: "EMPLOYER PTY LTD SALARY",
        amount: 4000,
        kind: "income",
        categoryId: "income-salary",
        oneOffOverride: null,
        needsReview: false,
        isSplitParent: false,
      },
    ];

    const summary = monthlySummary(rows, "2025-03", SEED);
    expect(summary.totalIncome).toBe(4000);
    expect(summary.totalSpent).toBe(0);
  });
});

describe("marking a transfer in the review queue", () => {
  it("clears the row without giving it a category", async () => {
    const { db, household } = await freshDb();
    open = db;
    await insertTransactions(db, household, [
      txn({
        date: "2025-03-05",
        month: "2025-03",
        description: "TRANSFER RECEIPT TRANSFER FROM",
        merchantKey: "TRANSFER FROM",
        categoryId: null,
        needsReview: true,
        sourceFingerprint: "t1",
      }),
    ]);

    const [before] = await listTransactions(db, household, { needsReview: true });
    await categoriseTransaction(db, household, before.id, { categoryId: null, kind: "transfer" });

    expect(await listTransactions(db, household, { needsReview: true })).toHaveLength(0);
    const [after] = await listTransactions(db, household, {});
    expect(after.kind).toBe("transfer");
    expect(after.categoryId).toBeNull();
  });
});
