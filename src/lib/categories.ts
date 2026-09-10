export type CategoryKind = "expense" | "income";

export type CategoryGroup =
  | "Mortgage"
  | "Insurance"
  | "Utilities"
  | "Subscriptions"
  | "Food"
  | "Transport"
  | "Medical"
  | "Personal"
  | "Pet"
  | "Other"
  | "One-off"
  | "Income";

export type Category = {
  id: string;
  name: string;
  group: CategoryGroup;
  kind: CategoryKind;
  /**
   * True for costs that must not feed recurring monthly averages. A real flag,
   * not a naming convention — the spreadsheet version only encoded this in
   * category names because it had no macros.
   */
  oneOff: boolean;
  /**
   * How often this category actually bills. Water and electricity here arrive
   * roughly every 2 months; rates are annual. A trailing average that assumes
   * 1 understates anything larger.
   */
  cadenceMonths: number;
};

export const CATEGORIES: Category[] = [
  {
    id: "mortgage-repayment",
    name: "Mortgage Repayment",
    group: "Mortgage",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },

  {
    id: "insurance-home-contents",
    name: "Home & Contents Insurance",
    group: "Insurance",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "insurance-car",
    name: "Car Insurance",
    group: "Insurance",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "insurance-roadside",
    name: "Roadside Assist",
    group: "Insurance",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 12,
  },
  {
    id: "insurance-health",
    name: "Health Insurance",
    group: "Insurance",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },

  {
    id: "utilities-electricity",
    name: "Electricity",
    group: "Utilities",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 2,
  },
  {
    id: "utilities-gas",
    name: "Gas",
    group: "Utilities",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "utilities-water",
    name: "Water",
    group: "Utilities",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 2,
  },
  {
    id: "utilities-internet",
    name: "Internet",
    group: "Utilities",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "utilities-mobile",
    name: "Mobile Phone",
    group: "Utilities",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },

  {
    id: "sub-netflix",
    name: "Netflix",
    group: "Subscriptions",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "sub-youtube",
    name: "YouTube Premium",
    group: "Subscriptions",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "sub-hbo-max",
    name: "HBO Max",
    group: "Subscriptions",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "sub-disney-plus",
    name: "Disney Plus",
    group: "Subscriptions",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "sub-ai-tools",
    name: "AI Tools",
    group: "Subscriptions",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "sub-water-purifier",
    name: "Water Purifier Rental",
    group: "Subscriptions",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  // Catch-all: many different in-app charges all bill as APPLE.COM/BILL. Bank
  // statement text cannot separate them, and pretending otherwise is worse.
  {
    id: "sub-apple",
    name: "Apple / iCloud",
    group: "Subscriptions",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },

  {
    id: "food-groceries",
    name: "Groceries",
    group: "Food",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "food-dining",
    name: "Dining / Cafe / Takeaway",
    group: "Food",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },

  {
    id: "transport-fuel-parking-car",
    name: "Fuel / Parking / Car",
    group: "Transport",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "transport-car-finance",
    name: "Car Finance Payment",
    group: "Transport",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },

  {
    id: "medical-out-of-pocket",
    name: "Medical / Health (out of pocket)",
    group: "Medical",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },

  {
    id: "personal-fitness",
    name: "Fitness / Gym",
    group: "Personal",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "personal-care",
    name: "Personal Care",
    group: "Personal",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "personal-clothing",
    name: "Clothing / Shopping",
    group: "Personal",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },

  {
    id: "pet-insurance",
    name: "Pet Insurance",
    group: "Pet",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "pet-care",
    name: "Pet Care",
    group: "Pet",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },

  {
    id: "other-cash-withdrawal",
    name: "Cash Withdrawal (ATM)",
    group: "Other",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "other-discretionary",
    name: "Other / Discretionary",
    group: "Other",
    kind: "expense",
    oneOff: false,
    cadenceMonths: 1,
  },

  {
    id: "oneoff-house-settlement",
    name: "House Purchase Settlement",
    group: "One-off",
    kind: "expense",
    oneOff: true,
    cadenceMonths: 1,
  },
  {
    id: "oneoff-moving",
    name: "Moving Costs",
    group: "One-off",
    kind: "expense",
    oneOff: true,
    cadenceMonths: 1,
  },
  {
    id: "oneoff-home-hardware",
    name: "Home / Hardware / Renovation",
    group: "One-off",
    kind: "expense",
    oneOff: true,
    cadenceMonths: 1,
  },
  {
    id: "oneoff-furniture",
    name: "Furniture / Homewares",
    group: "One-off",
    kind: "expense",
    oneOff: true,
    cadenceMonths: 1,
  },
  {
    id: "oneoff-travel",
    name: "Travel",
    group: "One-off",
    kind: "expense",
    oneOff: true,
    cadenceMonths: 1,
  },
  // Ticket purchases. Not a subscription, despite living with streaming in the
  // first spreadsheet pass.
  {
    id: "oneoff-entertainment-events",
    name: "Entertainment / Events",
    group: "One-off",
    kind: "expense",
    oneOff: true,
    cadenceMonths: 1,
  },
  {
    id: "oneoff-government-rates",
    name: "Government / Rates",
    group: "One-off",
    kind: "expense",
    oneOff: true,
    cadenceMonths: 12,
  },
  {
    id: "oneoff-business-tax",
    name: "Business / Tax Service",
    group: "One-off",
    kind: "expense",
    oneOff: true,
    cadenceMonths: 12,
  },
  {
    id: "oneoff-pet-adoption",
    name: "Pet Adoption Deposit",
    group: "One-off",
    kind: "expense",
    oneOff: true,
    cadenceMonths: 1,
  },
  {
    id: "oneoff-pet-sitting",
    name: "Pet Sitting (travel)",
    group: "One-off",
    kind: "expense",
    oneOff: true,
    cadenceMonths: 1,
  },
  {
    id: "oneoff-car-deposit",
    name: "Car Purchase Deposit",
    group: "One-off",
    kind: "expense",
    oneOff: true,
    cadenceMonths: 1,
  },
  {
    id: "oneoff-large-purchase",
    name: "Large One-off Purchase",
    group: "One-off",
    kind: "expense",
    oneOff: true,
    cadenceMonths: 1,
  },

  {
    id: "income-salary",
    name: "Salary",
    group: "Income",
    kind: "income",
    oneOff: false,
    cadenceMonths: 1,
  },
  {
    id: "income-house-purchase-funds",
    name: "Income — House Purchase Funds",
    group: "Income",
    kind: "income",
    oneOff: true,
    cadenceMonths: 1,
  },
  {
    id: "income-oneoff-other",
    name: "Income — One-off (refunds, bonds)",
    group: "Income",
    kind: "income",
    oneOff: true,
    cadenceMonths: 1,
  },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export const GROUP_ORDER: CategoryGroup[] = [
  "Income",
  "Mortgage",
  "Insurance",
  "Utilities",
  "Subscriptions",
  "Food",
  "Transport",
  "Medical",
  "Personal",
  "Pet",
  "Other",
  "One-off",
];

export function categoriesByGroup(): [CategoryGroup, Category[]][] {
  return GROUP_ORDER.map(
    (g) => [g, CATEGORIES.filter((c) => c.group === g)] as [CategoryGroup, Category[]],
  ).filter(([, list]) => list.length > 0);
}

export function getCategory(id: string | null | undefined): Category | undefined {
  return id ? CATEGORY_BY_ID.get(id) : undefined;
}
