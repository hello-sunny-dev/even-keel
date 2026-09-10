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

describe("page furniture is not a merchant", () => {
  // Both of these follow real parser output, where the
  // address block at the foot of a page was merged into whichever transaction
  // happened to end that page.
  it("does not glue the footer onto the last row of a page", () => {
    const { transactions } = parse(`
      07/09/2026 PETCO NEWCO PTY LTD -51.99
      GPO Box 4094 Sydney NSW
      Australia 2001 | www.examplebank.com.au
    `);

    expect(transactions).toHaveLength(1);
    expect(transactions[0].description).toBe("PETCO NEWCO PTY LTD");
  });

  it("cuts the boilerplate that shares a line with the merchant", () => {
    const { transactions } = parse(
      `07/09/2026 CBA Acme Salary us a secure message via online banking 2584.19`,
    );

    expect(transactions[0].description).toBe("CBA Acme Salary");
  });

  it("still merges a genuinely wrapped merchant name", () => {
    const { transactions } = parse(`
      07/09/2026 SQ *CORNER BAKERY -46.00
      NORTHSIDE WA
    `);

    expect(transactions[0].description).toBe("SQ *CORNER BAKERY NORTHSIDE WA");
  });

  it("keeps the merchant key clean, which is what rules match on", () => {
    const withFooter = parse(`
      07/09/2026 BUNNINGS 2174 NORTHSID -32.09
      GPO Box 4094 Sydney NSW
    `).transactions[0];
    const without = parse(`07/09/2026 BUNNINGS 2174 NORTHSID -32.09`).transactions[0];

    // A contaminated key is a rule that matches one transaction and never
    // fires again — the failure is silent and shows up as an untagged queue.
    expect(withFooter.merchantKey).toBe(without.merchantKey);
  });
});

describe("a mortgage statement, where the balance is negative", () => {
  // Jamie's the bank home-loan, reduced to its numbers. Every figure here
  // is from the real statement; the parser reported it as $8,119.84 out.
  const MORTGAGE = `
    Brought Forward -$412,836.27
    06 Jul 2026 Repayment - Direct Credit $1,538.46 -$411,297.81
    20 Jul 2026 Repayment - Direct Credit $1,538.46 -$409,759.35
    31 Jul 2026 Interest Charge -$2,041.13 -$411,800.48
    03 Aug 2026 Repayment - Direct Credit $1,538.46 -$410,262.02
    17 Aug 2026 Repayment - Direct Credit $1,538.46 -$408,723.56
    31 Aug 2026 Repayment - Direct Credit $1,538.46 -$407,185.10
    31 Aug 2026 Interest Charge -$2,018.79 -$409,203.89
    Closing Balance -$409,203.89
  `;

  it("keeps the minus on a balance that is owed, not held", () => {
    const result = parse(MORTGAGE, { statementYear: 2026 });

    expect(result.openingBalance).toBe(-412836.27);
    expect(result.closingBalance).toBe(-409203.89);
  });

  it("reads a repayment as money in, because it reduces the debt", () => {
    // The sign comes from the balance moving. Read as a positive balance the
    // deltas invert and every repayment becomes another $1,538.46 owed.
    const { transactions } = parse(MORTGAGE, { statementYear: 2026 });
    const repayments = transactions.filter((t) => t.description.includes("Repayment"));

    expect(repayments).toHaveLength(5);
    expect(repayments.every((t) => t.amount === 1538.46)).toBe(true);
  });

  it("reads an interest charge as money out", () => {
    const { transactions } = parse(MORTGAGE, { statementYear: 2026 });
    const interest = transactions.filter((t) => t.description.includes("Interest"));

    expect(interest.map((t) => t.amount)).toEqual([-2041.13, -2018.79]);
  });

  it("reconciles, which it did not before", () => {
    const result = parse(MORTGAGE, { statementYear: 2026 });
    const moved = result.transactions.reduce((sum, t) => sum + Math.round(t.amount * 100), 0);
    const drift =
      Math.round(result.openingBalance! * 100) + moved - Math.round(result.closingBalance! * 100);

    expect(drift).toBe(0);
  });
});

describe("a balance label with its amount on the next line", () => {
  // Three of five real statements reported "no balances to check", which means
  // nothing could prove a row had not been dropped from any of them.
  it("finds both balances", () => {
    const result = parse(
      [
        "Opening balance",
        "4,218.37",
        "01/07/2026 LUNCH BAR 55 -6.90 4,211.47",
        "Closing balance",
        "4,211.47",
      ].join("\n"),
      { statementYear: 2026 },
    );

    expect(result.openingBalance).toBe(4218.37);
    expect(result.closingBalance).toBe(4211.47);
  });

  it("does not read the label as part of the last transaction", () => {
    const { transactions } = parse(
      ["30/06/2026 INTEREST CHARGE RECEIPT -1987.63 -409203.89", "Closing balance"].join("\n"),
      { statementYear: 2026 },
    );

    expect(transactions[0].description).toBe("INTEREST CHARGE RECEIPT");
  });

  it("keeps working when the label and amount share a line", () => {
    const result = parse("Closing Balance -$409,203.89", { statementYear: 2026 });
    expect(result.closingBalance).toBe(-409203.89);
  });
});
