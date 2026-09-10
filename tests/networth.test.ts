import { describe, expect, it } from "vitest";
import {
  movementFor,
  netWorthAt,
  netWorthSeries,
  signedFor,
  type Account,
  type Balance,
} from "@/lib/networth";

const savings: Account = {
  id: "a-cash",
  name: "Offset",
  kind: "cash",
  bucket: "available",
  currency: "AUD",
  archived: false,
};
const etf: Account = {
  id: "a-etf",
  name: "ETFs",
  kind: "investment",
  bucket: "invested",
  currency: "AUD",
  archived: false,
};
const superannuation: Account = {
  id: "a-super",
  name: "Super",
  kind: "super",
  bucket: "locked",
  currency: "AUD",
  archived: false,
};
const house: Account = {
  id: "a-house",
  name: "House",
  kind: "property",
  bucket: "locked",
  currency: "AUD",
  archived: false,
};
const mortgage: Account = {
  id: "a-loan",
  name: "Mortgage",
  kind: "loan",
  bucket: "locked",
  currency: "AUD",
  archived: false,
};

const ACCOUNTS = [savings, etf, superannuation, house, mortgage];

function at(accountId: string, month: string, amount: number, contributed = 0): Balance {
  return { accountId, month, amount, contributed };
}

describe("what everything adds up to", () => {
  const balances = [
    at("a-cash", "2025-03", 20000),
    at("a-etf", "2025-03", 45000),
    at("a-super", "2025-03", 180000),
    at("a-house", "2025-03", 750000),
    at("a-loan", "2025-03", 480000),
  ];

  it("sorts accounts into what can be reached and what cannot", () => {
    const point = netWorthAt(ACCOUNTS, balances, "2025-03");

    expect(point.available).toBe(20000);
    expect(point.invested).toBe(45000);
    expect(point.locked).toBe(930000); // super + house
    expect(point.owed).toBe(480000);
    expect(point.netWorth).toBe(515000);
    expect(point.estimated).toBe(false);
  });

  it("subtracts the mortgage instead of adding it", () => {
    // The failure this guards against is a $480,000 debt reading as wealth.
    expect(signedFor("loan", 480000)).toBe(-480000);
    expect(signedFor("cash", 20000)).toBe(20000);

    const withoutLoan = netWorthAt(
      ACCOUNTS.filter((a) => a.kind !== "loan"),
      balances,
      "2025-03",
    );
    expect(withoutLoan.netWorth - netWorthAt(ACCOUNTS, balances, "2025-03").netWorth).toBe(480000);
  });

  it("leaves an archived account out", () => {
    const point = netWorthAt(
      ACCOUNTS.map((a) => (a.id === "a-etf" ? { ...a, archived: true } : a)),
      balances,
      "2025-03",
    );

    expect(point.invested).toBe(0);
    expect(point.netWorth).toBe(470000);
  });

  it("carries the last figure forward and says that it did", () => {
    const point = netWorthAt(ACCOUNTS, balances, "2025-06");

    expect(point.netWorth).toBe(515000);
    expect(point.estimated).toBe(true);
    expect(point.carried.sort()).toEqual(["a-cash", "a-etf", "a-house", "a-loan", "a-super"]);
  });

  it("counts nothing before the first figure was entered, and says so", () => {
    const point = netWorthAt(ACCOUNTS, balances, "2025-01");

    expect(point.netWorth).toBe(0);
    expect(point.estimated).toBe(false);
    // The distinction that matters: nothing was recorded, which is not the
    // same claim as a household worth nothing.
    expect(point.counted).toBe(0);
    expect(netWorthAt(ACCOUNTS, balances, "2025-03").counted).toBe(5);
  });
});

describe("growth, once contributions are taken out", () => {
  it("does not call a deposit a gain", () => {
    // $10,000 to $10,800 with $500 paid in is $300 earned, not $800.
    const balances = [at("a-etf", "2025-03", 10000), at("a-etf", "2025-04", 10800, 500)];
    const movement = movementFor(etf, balances, "2025-04");

    expect(movement).toMatchObject({ from: "2025-03", to: "2025-04", contributed: 500, gain: 300 });
  });

  it("refuses to guess from a single snapshot", () => {
    const movement = movementFor(etf, [at("a-etf", "2025-03", 10000, 500)], "2025-03");

    expect(movement?.gain).toBeNull();
  });

  it("does not invent a loss and a gain out of a skipped month", () => {
    // The spreadsheet failure this replaces: March 10,000, no April entry,
    // May 11,000 with 500 put in during April and 400 in May. Month by month
    // that reads as a 500 loss then a 900 gain. It is one span, and 100 of it
    // was earned.
    const balances = [
      at("a-etf", "2025-03", 10000),
      at("a-etf", "2025-04", 10500, 500),
      at("a-etf", "2025-05", 11000, 400),
    ];

    expect(movementFor(etf, balances, "2025-05")).toMatchObject({
      from: "2025-04",
      to: "2025-05",
      contributed: 400,
      gain: 100,
    });

    // And with April genuinely never entered, the span stretches to cover it
    // rather than pretending April happened.
    const skipped = [at("a-etf", "2025-03", 10000), at("a-etf", "2025-05", 11000, 900)];
    expect(movementFor(etf, skipped, "2025-05")).toMatchObject({
      from: "2025-03",
      to: "2025-05",
      contributed: 900,
      gain: 100,
    });
  });

  it("reads a mortgage the right way round", () => {
    // $480,000 owed, $2,000 repaid, $478,600 left: the debt fell by 1,400, so
    // 600 of interest was charged — and interest costs net worth.
    const balances = [at("a-loan", "2025-03", 480000), at("a-loan", "2025-04", 478600, 2000)];
    const movement = movementFor(mortgage, balances, "2025-04");

    expect(movement?.contributed).toBe(2000);
    expect(movement?.gain).toBe(-600);
  });

  it("reports a real loss as a loss", () => {
    const balances = [at("a-etf", "2025-03", 45000), at("a-etf", "2025-04", 41000)];

    expect(movementFor(etf, balances, "2025-04")?.gain).toBe(-4000);
  });
});

describe("the series", () => {
  it("marks only the months that were carried", () => {
    const balances = [at("a-cash", "2025-03", 20000), at("a-cash", "2025-05", 22000, 2000)];
    const series = netWorthSeries([savings], balances, ["2025-03", "2025-04", "2025-05"]);

    expect(series.map((p) => p.netWorth)).toEqual([20000, 20000, 22000]);
    expect(series.map((p) => p.estimated)).toEqual([false, true, false]);
  });
});
