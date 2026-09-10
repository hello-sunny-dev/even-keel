import { describe, expect, it } from "vitest";
import { merchantKey, redactDescription } from "@/lib/redact";

describe("stripping bank identifiers", () => {
  it("removes the numbers that identify an account", () => {
    const cases = [
      ["DIRECT DEBIT MORTGAGE 12345678", "12345678"],
      ["TRANSFER BSB 062-000 ACCT 12345678", "062-000"],
      ["PURCHASE CARD 4321 COLES", "4321"],
      ["VISA 4111 1111 1111 1111 SHOP", "4111"],
      ["PAYMENT A/C 98765432", "98765432"],
      ["WITHDRAWAL xxxx5678", "5678"],
    ];

    for (const [input, secret] of cases) {
      expect(redactDescription(input)).not.toContain(secret);
    }
  });

  it("keeps the part a person needs to recognise the row", () => {
    expect(redactDescription("DIRECT DEBIT MORTGAGE 12345678")).toBe("DIRECT DEBIT MORTGAGE");
    expect(redactDescription("PURCHASE CARD 4321 COLES")).toContain("COLES");
    expect(redactDescription("WOOLWORTHS 1234 PERTH WA")).toBe("WOOLWORTHS 1234 PERTH WA");
  });
});

describe("merchant identity", () => {
  it("is the same shop whichever till you went through", () => {
    expect(merchantKey("WOOLWORTHS 1234 PERTH WA")).toBe(merchantKey("WOOLWORTHS 5678 PERTH WA"));
  });

  it("ignores the payment rail and the state", () => {
    expect(merchantKey("VISA DEBIT PURCHASE COLES SUPERMARKETS NSW")).toBe(
      merchantKey("COLES SUPERMARKETS VIC"),
    );
  });

  it("never comes back empty, because an empty key would match everything", () => {
    // Strip "ATM WITHDRAWAL" of its rail words and nothing is left; a blank
    // key would then collide with every other blank one.
    expect(merchantKey("ATM WITHDRAWAL")).not.toBe("");
    expect(merchantKey("ATM WITHDRAWAL")).toContain("ATM");
  });

  it("keeps different merchants apart", () => {
    expect(merchantKey("NETFLIX.COM")).not.toBe(merchantKey("SPOTIFY"));
  });
});
