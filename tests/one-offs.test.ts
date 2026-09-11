import { describe, expect, it } from "vitest";
import { monthlySummary, oneOffRows, type Txn } from "@/lib/aggregate";
import { CATEGORIES, type Categories } from "@/lib/categories";

const SEED: Categories = new Map(CATEGORIES.map((c) => [c.id, c]));

function row(over: Partial<Txn> & { id: string }): Txn {
  return {
    date: "2025-03-05",
    month: "2025-03",
    description: "SOMETHING",
    amount: -100,
    kind: "expense",
    categoryId: "food-groceries",
    oneOffOverride: null,
    needsReview: false,
    isSplitParent: false,
    ...over,
  };
}

describe("the one-off page and the dashboard cannot disagree", () => {
  const rows: Txn[] = [
    row({ id: "1", categoryId: "food-groceries", amount: -184.55 }),
    row({ id: "2", categoryId: "oneoff-travel", amount: -1200 }),
    row({ id: "3", categoryId: "oneoff-furniture", amount: -430.9 }),
    // A month total is a real figure that is not a line on a statement. It is
    // kept out of the ledger and must stay in this sum.
    row({ id: "4", categoryId: "oneoff-home-hardware", amount: -640, description: "Renovation" }),
    // Marked one-off by hand in a category that is not.
    row({ id: "5", categoryId: "food-groceries", amount: -300, oneOffOverride: true }),
    // The reverse: a one-off category the user says was routine this time.
    row({ id: "6", categoryId: "oneoff-travel", amount: -55, oneOffOverride: false }),
    row({ id: "7", categoryId: "income-salary", amount: 5000, kind: "income" }),
  ];

  it("lists exactly what the month's one-off figure is made of", () => {
    const listed = oneOffRows(rows, "2025-03", SEED);
    const total = Number(listed.reduce((sum, t) => sum - t.amount, 0).toFixed(2));

    expect(total).toBe(monthlySummary(rows, "2025-03", SEED).oneOffSpent);
    expect(listed.map((t) => t.id)).toEqual(["2", "4", "3", "5"]);
  });

  it("puts the biggest first, because that is the one worth explaining", () => {
    expect(oneOffRows(rows, "2025-03", SEED)[0].amount).toBe(-1200);
  });

  it("obeys a per-transaction override in both directions", () => {
    const ids = oneOffRows(rows, "2025-03", SEED).map((t) => t.id);
    expect(ids).toContain("5");
    expect(ids).not.toContain("6");
  });

  it("leaves income out of it, however one-off the income was", () => {
    const withRefund = [
      ...rows,
      row({ id: "8", categoryId: "income-oneoff-other", amount: 900, kind: "income" }),
    ];
    expect(oneOffRows(withRefund, "2025-03", SEED).map((t) => t.id)).not.toContain("8");
  });
});
