import { describe, expect, it } from "vitest";
import { accountOf, safeName } from "@/lib/parse/filenames";

const EVERYDAY_Q3 = "Bank_Everyday_1122334455_2026-07-01_2026-09-06.pdf";
const EVERYDAY_Q1 = "Bank_Everyday_1122334455_2026-01-14_2026-03-31.pdf";
const ADVANTAGE = "Bank_HomeLoan_5544332211_2026-07-01_2026-09-06.pdf";

describe("printing a statement's name", () => {
  it("masks the account number", () => {
    expect(safeName(EVERYDAY_Q3)).toBe("Bank_Everyday_••••4455_2026-07-01_2026-09-06.pdf");
    expect(safeName(EVERYDAY_Q3)).not.toContain("1122334455");
  });

  it("keeps enough to tell two accounts apart", () => {
    expect(safeName(EVERYDAY_Q3)).not.toBe(safeName(ADVANTAGE));
  });

  it("leaves dates alone — they are not identifying", () => {
    expect(safeName(EVERYDAY_Q3)).toContain("2026-07-01");
  });

  it("does nothing to a name with no account number in it", () => {
    expect(safeName("sample-statement.pdf")).toBe("sample-statement.pdf");
  });
});

describe("grouping statements by account", () => {
  it("puts two periods of one account together", () => {
    expect(accountOf(EVERYDAY_Q1)).toBe(accountOf(EVERYDAY_Q3));
  });

  it("keeps two accounts apart", () => {
    expect(accountOf(EVERYDAY_Q3)).not.toBe(accountOf(ADVANTAGE));
  });

  it("does not leak the number it grouped by", () => {
    expect(accountOf(EVERYDAY_Q3)).toBe("Bank_Everyday_••••4455");
  });

  it("falls back to the whole stem when there is no date", () => {
    expect(accountOf("statement.pdf")).toBe("statement");
  });
});
