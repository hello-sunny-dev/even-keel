import { beforeAll, describe, expect, it } from "vitest";
import { categorize } from "@/lib/categorize";
import { CATEGORIES, type Categories } from "@/lib/categories";
import {
  availableMonths,
  categoryBreakdown,
  isOneOff,
  monthlySummary,
  recurringMonthlyRate,
  trendSeries,
  type Txn,
} from "@/lib/aggregate";
import { SAMPLE, parseFixture, reconciles } from "./fixtures";

// What `seedCategories` writes into a new household. The aggregates read the
// table, never the seed array; this stands in for the table.
const SEED: Categories = new Map(CATEGORIES.map((c) => [c.id, c]));

let txns: Txn[];

beforeAll(async () => {
  const { transactions } = await parseFixture(SAMPLE);
  txns = transactions.map((t, i) => {
    const match = categorize(t.description, SEED);
    const categoryId = match.status === "matched" ? match.categoryId : null;
    return {
      id: `t${i}`,
      date: t.date,
      month: t.month,
      description: t.description,
      amount: t.amount,
      kind: SEED.get(categoryId ?? "")?.kind ?? (t.amount > 0 ? "income" : "expense"),
      categoryId,
      oneOffOverride: null,
      needsReview: match.status !== "matched",
      isSplitParent: false,
    };
  });
});

// Worked out by hand from the fixture, not read off the implementation.
describe("March 2025, against figures calculated by hand", () => {
  it("totals income, spending and what was kept", () => {
    const s = monthlySummary(txns, "2025-03", SEED, { monthlyAmount: 2500 });

    expect(s.totalIncome).toBe(7450); // 6,200 salary + 1,250 tax refund
    expect(s.coreIncome).toBe(6200); // the refund is one-off income
    expect(s.totalSpent).toBe(4432.83);
    expect(s.actualSaved).toBe(3017.17);
    expect(s.oneOffSpent).toBe(460.3); // Ticketek 318.00 + Bunnings 142.30
    expect(s.recurringSpent).toBe(3972.53);
  });

  it("agrees with the statement's own balances", () => {
    // Saved must equal what the bank says moved: 10,994.04 − 5,000.00 over
    // both months. If these disagree, one of them is wrong.
    const march = monthlySummary(txns, "2025-03", SEED, null);
    const april = monthlySummary(txns, "2025-04", SEED, null);

    expect(march.actualSaved + april.actualSaved).toBeCloseTo(5994.04, 2);
  });

  it("scores the month against the plan", () => {
    expect(monthlySummary(txns, "2025-03", SEED, { monthlyAmount: 2500 })).toMatchObject({
      requiredSaving: 2500,
      vsPlan: 517.17,
      passed: true,
    });
    expect(monthlySummary(txns, "2025-03", SEED, { monthlyAmount: 3500 })).toMatchObject({
      vsPlan: -482.83,
      passed: false,
    });
  });

  it("counts what still needs a category", () => {
    const s = monthlySummary(txns, "2025-03", SEED, null);

    expect(s.needsReviewCount).toBe(1); // ZEPHYR TRADING CO matches nothing
    expect(s.transactionCount).toBe(16);
  });
});

describe("April 2025", () => {
  it("totals correctly with no one-off costs at all", () => {
    const s = monthlySummary(txns, "2025-04", SEED, { monthlyAmount: 2500 });

    expect(s.totalIncome).toBe(6200);
    expect(s.totalSpent).toBe(3223.13);
    expect(s.actualSaved).toBe(2976.87);
    expect(s.oneOffSpent).toBe(0);
  });
});

describe("the category breakdown", () => {
  it("adds each category up and compares it to its target", () => {
    const rows = categoryBreakdown(txns, "2025-03", SEED, new Map([["food-groceries", 320]]));
    const groceries = rows.find((r) => r.categoryId === "food-groceries");

    expect(groceries?.actual).toBe(280.95); // Woolworths 184.55 + Metcash 96.40
    expect(groceries?.target).toBe(320);
    expect(groceries?.variance).toBe(-39.05);
  });

  it("leaves income out of it and sorts by what was spent", () => {
    const rows = categoryBreakdown(txns, "2025-03", SEED);

    expect(rows.some((r) => r.group === "Income")).toBe(false);
    expect(rows[0].categoryId).toBe("mortgage-repayment");
  });
});

describe("one-off is a flag on the data", () => {
  it("follows the category, and a per-transaction override beats it", () => {
    const ticketek = txns.find((t) => t.description.includes("TICKETEK"))!;
    const groceries = txns.find((t) => t.description.includes("WOOLWORTHS"))!;

    expect(isOneOff(ticketek, SEED)).toBe(true);
    expect(isOneOff(groceries, SEED)).toBe(false);
    expect(isOneOff({ ...groceries, oneOffOverride: true }, SEED)).toBe(true);
    expect(isOneOff({ ...ticketek, oneOffOverride: false }, SEED)).toBe(false);
  });
});

describe("recurring run rates", () => {
  it("averages a bimonthly bill over whole billing cycles", () => {
    // $300 of water every two months over six months is $150 a month, not the
    // $100 a naive divide-by-six would report.
    const water = SEED.get("utilities-water")!;
    const rows: Txn[] = ["2025-01", "2025-03", "2025-05"].map((month, i) => ({
      id: `w${i}`,
      date: `${month}-15`,
      month,
      description: "WATER CORPORATION",
      amount: -300,
      kind: "expense",
      categoryId: water.id,
      oneOffOverride: null,
      needsReview: false,
      isSplitParent: false,
    }));

    expect(recurringMonthlyRate(rows, water, SEED, { asOfMonth: "2025-06" }).rate).toBe(150);
  });

  it("measures a new cost from its own first month, not the ledger's", () => {
    // A car loan two months old must not be averaged over a year of history
    // it was never part of.
    const finance = SEED.get("transport-car-finance")!;
    const rows: Txn[] = ["2025-05", "2025-06"].map((month, i) => ({
      id: `c${i}`,
      date: `${month}-02`,
      month,
      description: "CAR FINANCE",
      amount: -650,
      kind: "expense",
      categoryId: finance.id,
      oneOffOverride: null,
      needsReview: false,
      isSplitParent: false,
    }));

    const rate = recurringMonthlyRate(rows, finance, SEED, { asOfMonth: "2025-06" });
    expect(rate.rate).toBe(650);
    expect(rate.newlyStarted).toBe(true);
  });

  it("lets a confirmed rate override the average outright", () => {
    const finance = SEED.get("transport-car-finance")!;
    const rate = recurringMonthlyRate([], finance, SEED, {
      asOfMonth: "2025-06",
      confirmedRate: 650,
    });

    expect(rate).toMatchObject({ rate: 650, basis: "confirmed" });
  });
});

describe("the month series", () => {
  it("runs from the first month to the last and accumulates", () => {
    const series = trendSeries(txns, SEED);

    expect(series.map((p) => p.month)).toEqual(["2025-03", "2025-04"]);
    expect(series[1].cumulativeNet).toBeCloseTo(5994.04, 2);
    expect(availableMonths(txns)).toEqual(["2025-04", "2025-03"]);
  });
});

describe("the fixture itself", () => {
  it("reconciles, so these figures are anchored to something real", async () => {
    expect(reconciles(await parseFixture(SAMPLE))).toBe(0);
  });
});
