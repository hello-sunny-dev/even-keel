import { describe, expect, it } from "vitest";
import { CATEGORIES, type Categories } from "@/lib/categories";
import { proposeFrom, toInsertable } from "@/lib/ingest";
import { looksLikeLoanAccount } from "@/lib/parse/statement";
import type { ParseResult, ParsedTransaction } from "@/lib/parse/statement";
import { classifyLoanRow } from "@/lib/loan-statement";

const SEED: Categories = new Map(CATEGORIES.map((c) => [c.id, c]));

function txn(description: string, amount: number, i = 0): ParsedTransaction {
  return {
    date: "2026-03-02",
    month: "2026-03",
    description,
    amount,
    balance: null,
    signSource: "tail",
    sourceFingerprint: `fp-${i}-${description}`,
  } as unknown as ParsedTransaction;
}

function statement(rows: ParsedTransaction[]): ParseResult {
  return {
    transactions: rows,
    openingBalance: null,
    closingBalance: null,
    skipped: [],
    warnings: [],
    isLoanAccount: looksLikeLoanAccount(rows),
  };
}

/** The rows that were actually on the home-loan statement, as it prints them. */
const LOAN = [
  txn(
    "INTEREST CHARGE RECEIPT OFFSET BENEFIT OF $27.40 RECEIVED FROM YOUR EVERYDAY ACCOUNT",
    -812.57,
    1,
  ),
  txn("TRANSFER RECEIPT TRANSFER FROM", 1068.24, 2),
  txn("LMI FEES RECEIPT LMI Fee", -6712.43, 3),
  txn("SETTLEMENT FEE RECEIPT Settlement Fee", -350, 4),
  txn("OA ANNUAL FEE RECEIPT", -299, 5),
];

describe("telling a loan statement from a spending one", () => {
  it("reads a loan account from what is on it, not from its filename", () => {
    expect(looksLikeLoanAccount(LOAN)).toBe(true);
  });

  it("does not call an everyday account a loan because it earned interest", () => {
    // A savings account pays interest and is still somewhere you spend from.
    const everyday = [
      txn("Visa Purchase - Receipt WOOLWORTHS NORTHSIDE", -84.2, 6),
      txn("INTEREST CHARGE RECEIPT", -1.1, 7),
    ];
    expect(looksLikeLoanAccount(everyday)).toBe(false);
  });
});

describe("a row on a home-loan statement", () => {
  it("reads money arriving as the repayment, not as income", () => {
    expect(classifyLoanRow("TRANSFER RECEIPT TRANSFER FROM", 1068.24)).toEqual({
      kind: "transfer",
    });
  });

  it("files the interest, which is the part that actually leaves", () => {
    expect(classifyLoanRow("INTEREST CHARGE RECEIPT OFFSET BENEFIT", -812.57)).toEqual({
      kind: "category",
      categoryId: "mortgage-interest",
    });
  });

  it("files the costs that only exist on a mortgage", () => {
    expect(classifyLoanRow("LMI FEES RECEIPT LMI Fee", -6712.43)).toEqual({
      kind: "category",
      categoryId: "oneoff-house-settlement",
    });
    expect(classifyLoanRow("SETTLEMENT FEE RECEIPT Settlement Fee", -350)).toEqual({
      kind: "category",
      categoryId: "oneoff-house-settlement",
    });
    expect(classifyLoanRow("OA ANNUAL FEE RECEIPT", -299)).toEqual({
      kind: "category",
      categoryId: "other-bank-fees",
    });
  });

  it("leaves the drawdown to be answered by a person", () => {
    // One large debit at the start of a loan is the house being bought. Being
    // wrong about that row is expensive, so it is asked about.
    expect(classifyLoanRow("SWIFT TRANSFER RECEIPT", -386250)).toEqual({ kind: "unknown" });
  });
});

describe("importing a home-loan statement", () => {
  it("tags every row that has an answer, and asks about the one that does not", () => {
    const rows = proposeFrom(
      statement([...LOAN, txn("SWIFT TRANSFER RECEIPT", -386250, 8)]),
      "loan.pdf",
      SEED,
      [],
    );

    const byDescription = new Map(rows.map((r) => [r.description, r]));
    expect(byDescription.get("TRANSFER RECEIPT TRANSFER FROM")!.kind).toBe("transfer");
    expect(byDescription.get("OA ANNUAL FEE RECEIPT")!.categoryId).toBe("other-bank-fees");
    expect(byDescription.get("SWIFT TRANSFER RECEIPT")!.categoryId).toBeNull();

    const insertable = toInsertable(rows, "pdf", SEED);
    const repayment = insertable.find((r) => r.description === "TRANSFER RECEIPT TRANSFER FROM")!;
    expect(repayment.needsReview).toBe(false);
    expect(repayment.kind).toBe("transfer");
  });

  it("does none of this to the same words on an everyday statement", () => {
    // The whole point: identical text, different account, different answer.
    const everyday = statement([
      txn("Visa Purchase - Receipt WOOLWORTHS NORTHSIDE", -84.2, 9),
      txn("TRANSFER RECEIPT TRANSFER FROM", 1068.24, 10),
    ]);
    const rows = proposeFrom(everyday, "everyday.pdf", SEED, []);
    const transfer = rows.find((r) => r.description === "TRANSFER RECEIPT TRANSFER FROM")!;
    expect(transfer.kind).not.toBe("transfer");
    expect(transfer.categoryId).toBeNull();
  });
});
