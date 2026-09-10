import { describe, expect, it } from "vitest";
import { parseStatementText, transactionFingerprint } from "@/lib/parse/statement";

const parse = (text: string, opts = {}) => parseStatementText(text.trim(), opts);

describe("date formats", () => {
  it("reads the shapes a statement might print", () => {
    const { transactions } = parse(`
      05/03/2025 COLES 12.00 100.00
      06/03/25 COLES 12.00 88.00
      07-Mar-2025 COLES 12.00 76.00
    `);

    expect(transactions.map((t) => t.date)).toEqual(["2025-03-05", "2025-03-06", "2025-03-07"]);
  });

  it("takes the year from the statement header when rows omit it", () => {
    const { transactions } = parse(`
      Statement period 01/03/2024 to 31/03/2024
      05/03 COLES 12.00 100.00
    `);

    expect(transactions[0].date).toBe("2024-03-05");
  });

  it("rolls the year over when a statement runs December into January", () => {
    const { transactions } = parse(
      `
      28/12 COLES 12.00 100.00
      04/01 COLES 12.00 88.00
    `,
      { statementYear: 2024 },
    );

    expect(transactions.map((t) => t.date)).toEqual(["2024-12-28", "2025-01-04"]);
  });

  it("refuses to guess a year, and says so, rather than filing rows in the wrong one", () => {
    const result = parse(`05/03 COLES 12.00 100.00`);

    expect(result.transactions).toHaveLength(0);
    expect(result.warnings.join(" ")).toMatch(/no year found/i);
  });
});

describe("recovering the sign", () => {
  it("prefers an explicit sign", () => {
    expect(parse(`05/03/2025 REFUND +40.00`).transactions[0]).toMatchObject({
      amount: 40,
      signSource: "explicit",
    });
    expect(parse(`05/03/2025 COLES -40.00`).transactions[0]).toMatchObject({
      amount: -40,
      signSource: "explicit",
    });
  });

  it("reads CR and DR markers", () => {
    expect(parse(`05/03/2025 DEPOSIT 40.00 CR`).transactions[0]).toMatchObject({
      amount: 40,
      signSource: "cr_dr",
    });
    expect(parse(`05/03/2025 COLES 40.00 DR`).transactions[0]).toMatchObject({
      amount: -40,
      signSource: "cr_dr",
    });
  });

  it("derives it from the running balance when the amount is unsigned", () => {
    const { transactions } = parse(`
      Opening balance 1,000.00
      05/03/2025 COLES 40.00 960.00
      06/03/2025 PAY 500.00 1,460.00
    `);

    expect(transactions.map((t) => t.amount)).toEqual([-40, 500]);
    expect(transactions.every((t) => t.signSource === "balance")).toBe(true);
  });

  it("falls back to the words when there is no balance to lean on", () => {
    expect(parse(`05/03/2025 SALARY DEPOSIT 500.00`).transactions[0]).toMatchObject({
      amount: 500,
      signSource: "keyword",
    });
    expect(parse(`05/03/2025 COLES SUPERMARKET 40.00`).transactions[0]).toMatchObject({
      amount: -40,
      signSource: "keyword",
    });
  });
});

describe("lines that are not transactions", () => {
  it("keeps balance lines out of the ledger but uses them", () => {
    const result = parse(`
      Opening balance 1,000.00
      05/03/2025 COLES 40.00 960.00
      Closing balance 960.00
    `);

    expect(result.transactions).toHaveLength(1);
    expect(result.openingBalance).toBe(1000);
    expect(result.closingBalance).toBe(960);
  });

  it("ignores a dated header that carries no amount", () => {
    const result = parse(`
      Statement period 01/03/2025 to 31/03/2025
      05/03/2025 COLES 40.00 960.00
    `);

    expect(result.transactions).toHaveLength(1);
  });

  it("joins a description that wrapped onto the next line", () => {
    const { transactions } = parse(`
      05/03/2025 TICKETEK PTY LTD 318.00 682.00
      ENTERTAINMENT PURCHASE
    `);

    expect(transactions).toHaveLength(1);
    expect(transactions[0].description).toBe("TICKETEK PTY LTD ENTERTAINMENT PURCHASE");
  });
});

describe("fingerprints", () => {
  const row = {
    date: "2025-04-09",
    description: "APPLE.COM/BILL",
    amount: -4.49,
    balance: null as number | null,
  };

  it("keeps two identical charges on one day apart", () => {
    // This happens: two small Apple charges, same day, same amount. Collapsing
    // them into one loses money silently.
    const { transactions } = parse(`
      09/04/2025 APPLE.COM/BILL 4.49
      09/04/2025 APPLE.COM/BILL 4.49
    `);

    expect(transactions).toHaveLength(2);
    expect(transactions[0].sourceFingerprint).not.toBe(transactions[1].sourceFingerprint);
  });

  it("separates them by balance when the statement prints one", () => {
    const a = transactionFingerprint({ ...row, balance: 100 });
    const b = transactionFingerprint({ ...row, balance: 95.51 });

    expect(a).not.toBe(b);
  });

  it("does not change when a user corrects the amount afterwards", () => {
    // The confirm table lets a misparsed amount be fixed before import. If the
    // fingerprint moved with it, re-importing the statement would insert the
    // uncorrected row again as something new.
    const { transactions } = parse(`09/04/2025 APPLE.COM/BILL 4.49 95.51`);
    const parsed = transactions[0];
    const corrected = { ...parsed, amount: -44.9 };

    expect(corrected.sourceFingerprint).toBe(parsed.sourceFingerprint);
  });

  it("is stable across a re-parse of the same statement", () => {
    const text = `
      Opening balance 100.00
      09/04/2025 APPLE.COM/BILL 4.49 95.51
      09/04/2025 APPLE.COM/BILL 4.49 91.02
    `;

    expect(parse(text).transactions.map((t) => t.sourceFingerprint)).toEqual(
      parse(text).transactions.map((t) => t.sourceFingerprint),
    );
  });
});
