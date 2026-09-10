import { describe, expect, it } from "vitest";
import { categorize, userMerchantRule } from "@/lib/categorize";

const categoryOf = (description: string) => {
  const result = categorize(description);
  return result.status === "matched" ? result.categoryId : result.reason;
};

describe("matching a merchant to a category", () => {
  it("classifies the taxonomy's own examples", () => {
    const table: [string, string][] = [
      ["DIRECT DEBIT MORTGAGE HOME LOAN", "mortgage-repayment"],
      ["MEDIBANK PRIVATE", "insurance-health"],
      ["SYNERGY ELECTRICITY ACCOUNT", "utilities-electricity"],
      ["SUPERLOOP BROADBAND", "utilities-internet"],
      ["NETFLIX.COM", "sub-netflix"],
      ["APPLE.COM/BILL SYDNEY", "sub-apple"],
      ["WOOLWORTHS PERTH WA", "food-groceries"],
      ["UBER EATS", "food-dining"],
      ["BP CONNECT", "transport-fuel-parking-car"],
      ["ANYTIME FITNESS", "personal-fitness"],
      ["PETBARN", "pet-care"],
      ["ATM WITHDRAWAL", "other-cash-withdrawal"],
      ["BUNNINGS WAREHOUSE", "oneoff-home-hardware"],
      ["TICKETEK PTY LTD", "oneoff-entertainment-events"],
      ["QANTAS AIRWAYS", "oneoff-travel"],
      ["EMPLOYER PTY LTD SALARY", "income-salary"],
      ["ATO TAX REFUND", "income-oneoff-other"],
    ];

    for (const [description, expected] of table) {
      expect(categoryOf(description), description).toBe(expected);
    }
  });

  it("sends anything it does not recognise to the review queue", () => {
    // Guessing is worse than asking. An untagged row is visible; a
    // wrongly-tagged one is not.
    expect(categoryOf("ZEPHYR TRADING CO")).toBe("no_match");

    const result = categorize("ZEPHYR TRADING CO");
    expect(result.status).toBe("needs_review");
  });

  it("recognises a holding company that trades under another name", () => {
    // The registered name on a statement often looks nothing like the shop.
    expect(categoryOf("METCASH TRADING LTD")).toBe("food-groceries");
  });

  it("keeps a rental with 'water' in its name out of the water utility", () => {
    expect(categoryOf("COWAY WATER PURIFIER RENTAL")).toBe("sub-water-purifier");
    expect(categoryOf("WATER CORPORATION")).toBe("utilities-water");
  });

  it("puts every variety of small Apple charge in one honest bucket", () => {
    // Bank text cannot tell these apart, and pretending otherwise would be a
    // lie dressed up as detail.
    for (const description of ["APPLE.COM/BILL", "ITUNES.COM/BILL", "APPLE.COM/BILL SYDNEY"]) {
      expect(categoryOf(description)).toBe("sub-apple");
    }
  });

  it("carries the category's one-off default through", () => {
    const events = categorize("TICKETEK PTY LTD");
    const groceries = categorize("WOOLWORTHS PERTH WA");

    expect(events.status === "matched" && events.oneOff).toBe(true);
    expect(groceries.status === "matched" && groceries.oneOff).toBe(false);
  });
});

describe("remembering a correction", () => {
  it("applies a user's rule ahead of the seed rules", () => {
    const rule = userMerchantRule("METCASH TRADING LTD", "other-discretionary", "user-1");
    const result = categorize("METCASH TRADING LTD", [rule]);

    expect(result.status === "matched" && result.categoryId).toBe("other-discretionary");
    expect(result.status === "matched" && result.confidence).toBe(1);
  });

  it("recognises the same merchant through a different store number", () => {
    const rule = userMerchantRule("ZEPHYR TRADING CO 1234", "food-groceries", "user-2");
    const result = categorize("ZEPHYR TRADING CO 9876 PERTH", [rule]);

    expect(result.status === "matched" && result.categoryId).toBe("food-groceries");
  });

  it("asks rather than picks when two rules of equal weight disagree", () => {
    const a = userMerchantRule("SPLIT MERCHANT", "food-groceries", "user-3");
    const b = { ...userMerchantRule("SPLIT MERCHANT", "food-dining", "user-4") };
    const result = categorize("SPLIT MERCHANT", [a, b]);

    expect(result.status).toBe("needs_review");
    expect(result.status === "needs_review" && result.reason).toBe("ambiguous");
  });
});
