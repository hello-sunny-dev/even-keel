import { describe, expect, it } from "vitest";
import { FRAGMENTED, SAMPLE, parseFixture, reconciles } from "./fixtures";

describe("the committed statement fixtures", () => {
  it("extracts every transaction and reconciles against the printed balances", async () => {
    const result = await parseFixture(SAMPLE);

    expect(result.transactions).toHaveLength(27);
    expect(result.openingBalance).toBe(5000);
    expect(result.closingBalance).toBe(10994.04);
    expect(reconciles(result)).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("reads a statement whose fields are split into separate glyph runs the same way", async () => {
    // Real bank PDFs emit text in pieces. This fixture draws every field in
    // fragments with kerning-sized gaps; if line reassembly were wrong, words
    // would split or amounts would stop matching and rows would vanish.
    const [clean, fragmented] = await Promise.all([parseFixture(SAMPLE), parseFixture(FRAGMENTED)]);

    expect(fragmented.transactions).toEqual(clean.transactions);
    expect(reconciles(fragmented)).toBe(0);
  });

  it("gives every row a usable date, description and amount", async () => {
    const { transactions } = await parseFixture(SAMPLE);

    for (const t of transactions) {
      expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.month).toBe(t.date.slice(0, 7));
      expect(t.description.length).toBeGreaterThan(0);
      expect(Number.isFinite(t.amount)).toBe(true);
      expect(t.amount).not.toBe(0);
    }
  });

  it("recovers the sign from the running balance, because the statement prints none", async () => {
    const { transactions } = await parseFixture(SAMPLE);

    expect(transactions.every((t) => t.signSource === "balance")).toBe(true);

    const salary = transactions.find((t) => t.description.includes("SALARY"));
    const refund = transactions.find((t) => t.description.includes("REFUND"));
    expect(salary?.amount).toBe(6200);
    expect(refund?.amount).toBe(1250);
    expect(transactions.filter((t) => t.amount > 0)).toHaveLength(3);
  });

  it("strips account and card numbers before anything can be stored", async () => {
    const { transactions } = await parseFixture(SAMPLE);
    const text = transactions.map((t) => t.description).join(" | ");

    expect(text).not.toContain("12345678");
    expect(text).not.toMatch(/CARD\s*\d/i);
    expect(text).toContain("MORTGAGE HOME LOAN");
    expect(text).toContain("ATM WITHDRAWAL");
  });
});
