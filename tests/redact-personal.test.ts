import { describe, expect, it } from "vitest";
import { redactDescription, redactPersonal } from "@/lib/redact";

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
