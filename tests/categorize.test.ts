import { describe, expect, it } from "vitest";
import { categorize, userMerchantRule } from "@/lib/categorize";
import { CATEGORIES, type Categories } from "@/lib/categories";

const SEED: Categories = new Map(CATEGORIES.map((c) => [c.id, c]));

const categoryOf = (description: string) => {
  const result = categorize(description, SEED);
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

    const result = categorize("ZEPHYR TRADING CO", SEED);
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
    const events = categorize("TICKETEK PTY LTD", SEED);
    const groceries = categorize("WOOLWORTHS PERTH WA", SEED);

    expect(events.status === "matched" && events.oneOff).toBe(true);
    expect(groceries.status === "matched" && groceries.oneOff).toBe(false);
  });
});

describe("remembering a correction", () => {
  it("applies a user's rule ahead of the seed rules", () => {
    const rule = userMerchantRule("METCASH TRADING LTD", "other-discretionary", "user-1");
    const result = categorize("METCASH TRADING LTD", SEED, [rule]);

    expect(result.status === "matched" && result.categoryId).toBe("other-discretionary");
    expect(result.status === "matched" && result.confidence).toBe(1);
  });

  it("recognises the same merchant through a different store number", () => {
    const rule = userMerchantRule("ZEPHYR TRADING CO 1234", "food-groceries", "user-2");
    const result = categorize("ZEPHYR TRADING CO 9876 PERTH", SEED, [rule]);

    expect(result.status === "matched" && result.categoryId).toBe("food-groceries");
  });

  it("asks rather than picks when two rules of equal weight disagree", () => {
    const a = userMerchantRule("SPLIT MERCHANT", "food-groceries", "user-3");
    const b = { ...userMerchantRule("SPLIT MERCHANT", "food-dining", "user-4") };
    const result = categorize("SPLIT MERCHANT", SEED, [a, b]);

    expect(result.status).toBe("needs_review");
    expect(result.status === "needs_review" && result.reason).toBe("ambiguous");
  });
});

/**
 * Every string below is merchant text that actually appears on the household's
 * own statements — spelling, truncation and all. Synthetic examples kept
 * passing while the real queue filled up with forty untagged vending machine
 * rows, so these are the cases that decide whether the rules are any use.
 */
describe("the merchants these statements actually contain", () => {
  it("tags the food that keeps recurring", () => {
    const table: [string, string][] = [
      ["SMART VENDING PTY LTD", "food-dining"],
      ["LUNCH BAR 55", "food-dining"],
      ["FAMILY LUNCH BAR", "food-dining"],
      ["STARBUCKS", "food-dining"],
      ["MCDONALDS", "food-dining"],
      ["SUBWAY", "food-dining"],
      ["HJs Northside", "food-dining"],
      ["KFC", "food-dining"],
      ["OPORTO", "food-dining"],
      ["JESTERS", "food-dining"],
      ["French riviera", "food-dining"],
      ["LS Mission Burgers", "food-dining"],
      ["Mister Banh Mi", "food-dining"],
      ["Sanchurro", "food-dining"],
      ["Chatime", "food-dining"],
      ["Gelare", "food-dining"],
      ["Jamaica Blue", "food-dining"],
      ["Muzz Buzz", "food-dining"],
      ["SmartMart Supermarket", "food-groceries"],
      ["Ezymart", "food-groceries"],
      ["MKT Masters", "food-groceries"],
      ["SMP*Cutting Edge Butc", "food-groceries"],
      ["VEGIE BANDITS", "food-groceries"],
    ];

    for (const [description, expected] of table) {
      expect(categoryOf(description), description).toBe(expected);
    }
  });

  it("tags getting around", () => {
    const table: [string, string][] = [
      ["WILSON PARKING", "transport-fuel-parking-car"],
      ["SECURE PARKING", "transport-fuel-parking-car"],
      ["EasyPark", "transport-fuel-parking-car"],
      ["PTA SMARTRIDER", "transport-fuel-parking-car"],
      ["Reddy Express", "transport-fuel-parking-car"],
      ["Auto Classic W.A.", "transport-fuel-parking-car"],
      ["Honda North", "transport-fuel-parking-car"],
      ["TRANSPORT WA", "oneoff-government-rates"],
      ["Vehicle licence", "oneoff-government-rates"],
      ["CITY OF SAMPLE", "oneoff-government-rates"],
    ];

    for (const [description, expected] of table) {
      expect(categoryOf(description), description).toBe(expected);
    }
  });

  it("tags looking after people and animals", () => {
    const table: [string, string][] = [
      ["QT CLINICS", "medical-out-of-pocket"],
      ["CLINICARE PHARMACY", "medical-out-of-pocket"],
      ["ST JOHN GP", "medical-out-of-pocket"],
      ["Broadway Medical", "medical-out-of-pocket"],
      ["CLINICAL LABORATORIES", "medical-out-of-pocket"],
      ["CWH NORTHSIDE", "medical-out-of-pocket"],
      // A Medicare rebate lands in the category it reimburses, where a
      // positive amount nets against that month's spend rather than reading
      // as income.
      ["MCARE BENEFITS", "medical-out-of-pocket"],
      ["PETSURE", "pet-insurance"],
      ["PETCO NEWCO", "pet-care"],
      ["SQ *RIVERSIDE PETS", "pet-care"],
      ["MAD PAWS", "oneoff-pet-sitting"],
      ["Northside Fitn", "personal-fitness"],
    ];

    for (const [description, expected] of table) {
      expect(categoryOf(description), description).toBe(expected);
    }
  });

  it("tags the shops and the screens", () => {
    const table: [string, string][] = [
      ["BIG W", "personal-clothing"],
      ["REBEL", "personal-clothing"],
      ["SPOTLIGHT", "oneoff-furniture"],
      ["TEMPLE & WEBSTER", "oneoff-furniture"],
      ["OFFICEWORKS", "other-discretionary"],
      ["AMAZON MARKETPLACE", "other-discretionary"],
      ["JB HI FI", "other-discretionary"],
      ["STAN.COM.AU", "other-discretionary"],
      ["PLAYSTATION NETWORK", "other-discretionary"],
      ["Nintendo", "other-discretionary"],
      ["STEAM", "other-discretionary"],
      ["OPENAI *CHATGPT", "other-discretionary"],
    ];

    for (const [description, expected] of table) {
      expect(categoryOf(description), description).toBe(expected);
    }
  });

  it("tags money coming in", () => {
    const table: [string, string][] = [
      ["CBA Acme Salary", "income-salary"],
      ["FLEETWARE PAYROLL", "income-salary"],
      ["Oe Cashback", "income-oneoff-other"],
    ];

    for (const [description, expected] of table) {
      expect(categoryOf(description), description).toBe(expected);
    }
  });

  it("reads a fuel rebate as income and not as a petrol station", () => {
    // Both rules match the word "fuel"; only the priority decides, so this is
    // the assertion that stops a rebate from being filed as a tank of petrol.
    expect(categoryOf("Fuel Support Pay")).toBe("income-oneoff-other");
    expect(categoryOf("BP CONNECT FUEL")).toBe("transport-fuel-parking-car");
  });

  it("keeps a supermarket-branded petrol station out of the groceries", () => {
    expect(categoryOf("COLES EXPRESS")).toBe("transport-fuel-parking-car");
    expect(categoryOf("COLES NORTHSIDE")).toBe("food-groceries");
  });

  it("keeps a vet out of the medical category it now overlaps", () => {
    // Broadening "medical centre" to "clinic" put vets in range of both rules.
    expect(categoryOf("VET CLINIC NORTHSIDE")).toBe("pet-care");
    expect(categoryOf("VETERINARY SURGERY")).toBe("pet-care");
  });

  it("still asks about the ones that genuinely cannot be read", () => {
    // RAC sells car, home and roadside cover and the statement line names
    // none of them; a guess here would be a wrong number in a real total.
    expect(categoryOf("RACI")).toBe("no_match");
    // An ATO line is a tax bill or a tax refund depending on its sign, which
    // the description does not carry.
    expect(categoryOf("ATO ATO")).toBe("no_match");
  });
});
