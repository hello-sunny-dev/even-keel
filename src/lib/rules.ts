export type RuleSource = "seed" | "user";
export type RuleMatchType = "regex" | "merchant";

export type Rule = {
  id: string;
  /** Regex source for `regex` rules; an exact merchant key for `merchant` rules. */
  pattern: string;
  categoryId: string;
  matchType: RuleMatchType;
  source: RuleSource;
  /** Higher wins. Ties across different categories are treated as ambiguous. */
  priority: number;
};

export const PRIORITY = {
  userMerchant: 100,
  userRegex: 90,
  seedSpecific: 60,
  seed: 50,
  seedBroad: 40,
} as const;

type Seed = [pattern: string, categoryId: string, priority?: number];

/**
 * Seed rules, built from the merchant text on real statements. They are a
 * starting point, not the truth — every one of them can be overridden by a
 * user rule, and a correction made once is remembered as a merchant rule.
 */
const SEEDS: Seed[] = [
  ["\\bmortgage\\b|\\bhome\\s+loan\\b|\\bloan\\s+repayment\\b", "mortgage-repayment"],

  ["\\brac\\b.*\\b(home|contents|building)\\b", "insurance-home-contents", PRIORITY.seedSpecific],
  ["\\brac\\b.*\\b(motor|car|vehicle)\\b", "insurance-car", PRIORITY.seedSpecific],
  ["\\brac\\b.*\\b(roadside|breakdown)\\b", "insurance-roadside", PRIORITY.seedSpecific],
  ["\\bmedibank\\b|\\bbupa\\b|\\bhbf\\b", "insurance-health"],

  ["\\bsynergy\\b|\\belectricity\\b|\\bagl\\b|\\benergy\\s*australia\\b", "utilities-electricity"],
  ["\\borigin\\s*energy\\b|\\balinta\\b|\\bkleenheat\\b|\\bgas\\b", "utilities-gas"],
  [
    "\\bwater\\s*corp(oration)?\\b|\\bsa\\s*water\\b|\\bwater\\s+(rates|bill|account)\\b",
    "utilities-water",
    PRIORITY.seedSpecific,
  ],
  [
    "\\bsuperloop\\b|\\baussie\\s*broadband\\b|\\btpg\\b|\\bnbn\\b|\\binternet\\b",
    "utilities-internet",
  ],
  [
    "\\btelstra\\b|\\boptus\\b|\\bvodafone\\b|\\bamaysim\\b|\\bboost\\s*mobile\\b|\\bfelix\\b",
    "utilities-mobile",
  ],

  ["\\bnetflix\\b", "sub-netflix"],
  ["\\byoutube\\s*premium\\b|\\bgoogle\\s*\\*?\\s*youtube\\b", "sub-youtube"],
  ["\\bhbo\\s*max\\b|\\bmax\\.com\\b|\\bbinge\\b", "sub-hbo-max"],
  ["\\bdisney\\s*(\\+|plus)\\b", "sub-disney-plus"],
  ["\\bai\\s*tools\\b", "sub-ai-tools"],
  // A rental service that happens to have "water" in the name — it must beat
  // the water-utility rule, hence the higher priority.
  [
    "\\bcoway\\b|\\bwater\\s*purifier\\b|\\bpurifier\\s*rental\\b",
    "sub-water-purifier",
    PRIORITY.userRegex,
  ],
  // Deliberate catch-all: dozens of different in-app charges all bill under
  // the same descriptor and bank text cannot tell them apart.
  ["\\bapple\\.com/bill\\b|\\bapple\\s*(com)?\\s*bill\\b|\\bitunes\\b|\\bicloud\\b", "sub-apple"],

  [
    "\\bwoolworths\\b|\\bcoles\\b|\\baldi\\b|\\biga\\b|\\bfoodland\\b|\\bcostco\\b",
    "food-groceries",
  ],
  // Registered/holding-company names that look nothing like the shopfront.
  // This is the category most in need of user correction, so it stays broad.
  [
    "\\bmetcash\\b|\\bwoolworths\\s*group\\b|\\bendeavour\\s*group\\b",
    "food-groceries",
    PRIORITY.seedBroad,
  ],
  [
    "\\bcafe\\b|\\bcoffee\\b|\\brestaurant\\b|\\buber\\s*eats\\b|\\bdoordash\\b|\\bmenulog\\b|\\bdeliveroo\\b|\\bbakery\\b|\\bsushi\\b|\\bpizza\\b|\\bthai\\b|\\bkitchen\\b",
    "food-dining",
  ],

  [
    "\\bbp\\b|\\bcaltex\\b|\\bampol\\b|\\bshell\\b|\\b7-?eleven\\b|\\bunited\\s*petroleum\\b|\\bpuma\\s*energy\\b|\\bfuel\\b|\\bparking\\b|\\bwilson\\s*park\\b|\\bcar\\s*wash\\b|\\btransperth\\b",
    "transport-fuel-parking-car",
  ],
  ["\\bcar\\s*(loan|finance)\\b|\\bnovated\\b|\\bplenti\\b|\\bmoney3\\b", "transport-car-finance"],

  [
    "\\bpharmacy\\b|\\bchemist\\b|\\bmedical\\s*cent(re|er)\\b|\\bdental\\b|\\bdentist\\b|\\bphysio\\b|\\bpathology\\b|\\bgp\\s*clinic\\b|\\boptometrist\\b",
    "medical-out-of-pocket",
  ],

  [
    "\\bgym\\b|\\bfitness\\b|\\banytime\\s*fitness\\b|\\bf45\\b|\\bpilates\\b|\\byoga\\b",
    "personal-fitness",
  ],
  [
    "\\bhairdress\\w*\\b|\\bbarber\\b|\\bnails?\\b|\\bbeauty\\b|\\bmecca\\b|\\bpriceline\\b|\\bsephora\\b",
    "personal-care",
  ],
  [
    "\\buniqlo\\b|\\bkmart\\b|\\btarget\\b|\\bcotton\\s*on\\b|\\bh\\s*&\\s*m\\b|\\bzara\\b|\\bthe\\s*iconic\\b|\\bmyer\\b|\\bdavid\\s*jones\\b",
    "personal-clothing",
  ],

  [
    "\\bpet\\s*insurance\\b|\\bknose\\b|\\bpetplan\\b|\\btrupanion\\b",
    "pet-insurance",
    PRIORITY.seedSpecific,
  ],
  [
    "\\bpetbarn\\b|\\bpet\\s*stock\\b|\\bpetstock\\b|\\bvet\\b|\\bveterinar\\w*\\b|\\bpet\\s*circle\\b",
    "pet-care",
  ],

  ["\\batm\\b|\\bcash\\s*(withdrawal|out)\\b|\\bwithdrawal\\s*fee\\b", "other-cash-withdrawal"],

  [
    "\\bsettlement\\b.*\\b(conveyanc\\w*|solicitor|property)\\b|\\bconveyanc\\w*\\b",
    "oneoff-house-settlement",
    PRIORITY.seedSpecific,
  ],
  ["\\bremovalist\\w*\\b|\\bmoving\\s*co\\b|\\bman\\s*(with|and)\\s*a?\\s*van\\b", "oneoff-moving"],
  [
    "\\bbunnings\\b|\\bmitre\\s*10\\b|\\bhardware\\b|\\breece\\b|\\btotal\\s*tools\\b",
    "oneoff-home-hardware",
  ],
  [
    "\\bikea\\b|\\bfantastic\\s*furniture\\b|\\bfreedom\\b|\\bnick\\s*scali\\b|\\badairs\\b|\\bhome\\s*co\\b",
    "oneoff-furniture",
  ],
  [
    "\\bqantas\\b|\\bjetstar\\b|\\bvirgin\\s*aus\\w*\\b|\\bairbnb\\b|\\bbooking\\.com\\b|\\bexpedia\\b|\\bhotel\\b|\\bflight\\s*cent\\w*\\b",
    "oneoff-travel",
  ],
  // Tickets are an event, not a subscription — the spreadsheet had these
  // lumped in with streaming and it skewed the recurring average.
  [
    "\\bticketek\\b|\\bticketmaster\\b|\\bmoshtix\\b|\\beventbrite\\b|\\boztix\\b",
    "oneoff-entertainment-events",
    PRIORITY.seedSpecific,
  ],
  [
    "\\bcity\\s*of\\s+\\w+\\b|\\bshire\\s*of\\s+\\w+\\b|\\bcouncil\\s*rates\\b|\\bland\\s*tax\\b|\\bdept\\s*of\\s*transport\\b",
    "oneoff-government-rates",
  ],
  [
    "\\bh\\s*&\\s*r\\s*block\\b|\\betax\\b|\\baccountant\\b|\\basic\\b|\\bato\\s*(payment|bill)\\b",
    "oneoff-business-tax",
  ],
  [
    "\\badoption\\b.*\\b(dog|pet|rescue)\\b|\\b(dog|pet|rescue)\\b.*\\badoption\\b",
    "oneoff-pet-adoption",
    PRIORITY.seedSpecific,
  ],
  [
    "\\bpet\\s*sit\\w*\\b|\\bmad\\s*paws\\b|\\bboarding\\s*kennel\\b|\\bcattery\\b",
    "oneoff-pet-sitting",
    PRIORITY.seedSpecific,
  ],

  ["\\bsalary\\b|\\bpay\\s*run\\b|\\bpayroll\\b|\\bwages\\b", "income-salary"],
  [
    "\\bato\\s*refund\\b|\\btax\\s*refund\\b|\\bbond\\s*refund\\b|\\brental\\s*bond\\b",
    "income-oneoff-other",
    PRIORITY.seedSpecific,
  ],
  [
    "\\bhouse\\s*(purchase|deposit)\\s*funds?\\b|\\bsettlement\\s*proceeds\\b",
    "income-house-purchase-funds",
    PRIORITY.seedSpecific,
  ],
];

export const SEED_RULES: Rule[] = SEEDS.map(([pattern, categoryId, priority], i) => ({
  id: `seed-${i + 1}`,
  pattern,
  categoryId,
  matchType: "regex",
  source: "seed",
  priority: priority ?? PRIORITY.seed,
}));
