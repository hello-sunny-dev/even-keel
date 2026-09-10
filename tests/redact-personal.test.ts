import { describe, expect, it } from "vitest";
import { merchantKey, nameStripper, redactDescription, redactPersonal } from "@/lib/redact";

/**
 * These are the kinds of lines a statement header produces, printed by the
 * diagnostic script under the words "safe to share". They were not.
 */
describe("names and addresses in a statement header", () => {
  it("removes the account holders' names", () => {
    const out = redactPersonal("Mr Alex Morgan & Mrs Robin Lee");

    expect(out).not.toMatch(/Morgan|Robin/);
    expect(out).toContain("[name]");
  });

  it("removes the street address", () => {
    expect(redactPersonal("12 Sample Approach")).toBe("[address]");
    expect(redactPersonal("3/25 Wellington St")).toBe("[address]");
  });

  it("removes the suburb, state and postcode", () => {
    expect(redactPersonal("NORTHSIDE, WA 6000")).toBe("[suburb]");
  });

  it("still removes what it always did", () => {
    expect(redactPersonal("BSB 062-000 Account 12345678")).not.toMatch(/\d{6,}/);
  });

  it("leaves a merchant alone", () => {
    // A statement line is mostly merchants, and a diagnostic that redacts them
    // tells you nothing about whether parsing worked.
    expect(redactPersonal("WOOLWORTHS/CNR THEMAINSTR NORTHSIDE")).toBe(
      "WOOLWORTHS/CNR THEMAINSTR NORTHSIDE",
    );
    expect(redactPersonal("SQ *TAYLORS IN THE VALLEY Middle Swan")).toBe(
      "SQ *TAYLORS IN THE VALLEY Middle Swan",
    );
  });

  it("is not what runs on the way into the database", () => {
    // There, a merchant's suburb is part of its name — stripping it would
    // change the merchant key every categorisation rule matches on.
    expect(redactDescription("COLES 0292 W LEEDERVILL")).toContain("LEEDERVILL");
  });
});

describe("reference numbers glued to a name", () => {
  // Every one of these reached the database intact, because the old rule
  // wanted a word boundary and there was none.
  const REAL = [
    ["Direct Debit - Receipt Origin Energy Ho Oriene1000000001 To", "1000000001"],
    ["Direct Debit - Receipt Petsure (austral Petsur1000000003 To", "1000000003"],
    ["Direct Debit - Receipt Revo Fitness Mir Ezypayid_93397063 To", "93397063"],
    ["ATO ATO000000000000001", "000000000000001"],
  ] as const;

  it("removes them", () => {
    for (const [line, reference] of REAL) {
      expect(redactDescription(line)).not.toContain(reference);
    }
  });

  it("makes a recurring bill match itself from month to month", () => {
    // The reference changes every month, so the merchant key did too: a rule
    // tagged in April could never match May, and every direct debit landed in
    // the review queue for ever. Removing the reference is what fixes it.
    const april = merchantKey("Direct Debit - Receipt Origin Energy Ho Oriene1000000001 To");
    const june = merchantKey("Direct Debit - Receipt Origin Energy Ho Oriene1000000002 To");

    expect(april).toBe(june);
  });

  it("keeps a store number, which identifies a shop and not a person", () => {
    expect(redactDescription("COLES 0292 W LEEDERVILL")).toBe("COLES 0292 W LEEDERVILL");
    expect(redactDescription("BUNNINGS 2174 NORTHSID")).toContain("2174");
  });
});

describe("the household's own names", () => {
  const strip = nameStripper(["Jamie Robin Lee", "Alex Morgan"]);

  it("removes them from their own transactions", () => {
    expect(strip("Osko Deposit - Receipt R Lee & A Morgan")).toBe("Osko Deposit - Receipt");
    expect(strip("Ledger Tax INV-1000 Alex Morgan")).toBe("Ledger Tax INV-1000");
  });

  it("does not touch a merchant that merely starts the same way", () => {
    // Generic name detection would take these; knowing the household's actual
    // members is what makes it safe.
    expect(strip("Leeward Sushi-/11 Main St Northside")).toBe(
      "Leeward Sushi-/11 Main St Northside",
    );
    expect(strip("Harbour Cafe By Leeson")).toBe("Harbour Cafe By Leeson");
    expect(strip("KMART 1282 NORTHSIDE")).toBe("KMART 1282 NORTHSIDE");
  });

  it("does nothing when the household has no names to give", () => {
    expect(nameStripper([])("Osko Deposit - Receipt R Lee")).toBe("Osko Deposit - Receipt R Lee");
  });
});
