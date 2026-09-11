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
 *
 * Anything uncertain sits in `seedBroad`, which is still a match but the
 * lowest-confidence one. Two rules of equal priority pointing at different
 * categories are treated as ambiguous and sent to review, so a rule added
 * here has to be checked against the tier it lands in, not just read.
 */
const SEEDS: Seed[] = [
  ["\\bmortgage\\b|\\bhome\\s+loan\\b|\\bloan\\s+repayment\\b", "mortgage-repayment"],

  ["\\brac\\b.*\\b(home|contents|building)\\b", "insurance-home-contents", PRIORITY.seedSpecific],
  ["\\brac\\b.*\\b(motor|car|vehicle)\\b", "insurance-car", PRIORITY.seedSpecific],
  ["\\brac\\b.*\\b(roadside|breakdown)\\b", "insurance-roadside", PRIORITY.seedSpecific],
  ["\\bmedibank\\b|\\bbupa\\b|\\bhbf\\b|\\bnib\\b|\\bahm\\b|\\bhcf\\b", "insurance-health"],

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
    "\\bwoolworths\\b|\\bcoles\\b|\\baldi\\b|\\biga\\b|\\bfoodland\\b|\\bcostco\\b|\\bsupermarket\\b|\\bezymart\\b|\\bspudshed\\b|\\bdrakes\\b|\\bfarmer\\s*jacks?\\b|\\bharris\\s*farm\\b|\\bbutcher\\w*\\b|\\bcutting\\s*edge\\s*butc\\w*\\b|\\bgreengrocer\\b|\\bfruit\\s*(and|&)\\s*veg\\b",
    "food-groceries",
  ],
  // Registered/holding-company names that look nothing like the shopfront.
  // This is the category most in need of user correction, so it stays broad.
  [
    "\\bmetcash\\b|\\bwoolworths\\s*group\\b|\\bendeavour\\s*group\\b|\\bmkt\\s*masters\\b|\\bconvenience\\s*sto\\w*\\b|\\bvegg?ie\\b",
    "food-groceries",
    PRIORITY.seedBroad,
  ],
  [
    "\\bcafe\\b|\\bcoffee\\b|\\brestaurant\\w*\\b|\\buber\\s*\\*?\\s*eats\\b|\\bdoordash\\b|\\bmenulog\\b|\\bdeliveroo\\b|\\bbakery\\b|\\bsushi\\b|\\bpizza\\b|\\bthai\\b|\\bkitchen\\b|\\blunch\\s*bar\\b|\\bstarbucks\\b|\\bmcdonald\\w*\\b|\\bsubway\\b|\\bhjs\\b|\\bhungry\\s*jacks?\\b|\\bkfc\\b|\\boporto\\b|\\bjesters\\b|\\bnandos?\\b|\\bguzman\\b|\\bdominos?\\b|\\bred\\s*rooster\\b|\\bchicken\\s*treat\\b|\\bburgers?\\b|\\bgrill\\b|\\bbanh\\s*mi\\b|\\bsanchurro\\b|\\bchatime\\b|\\bgelare\\b|\\bjamaica\\s*blue\\b|\\bmuzz\\s*buzz\\b|\\bdome\\b|\\bfrench\\s*riviera\\b|\\bnoodle\\w*\\b|\\bramen\\b|\\bdumpling\\w*\\b|\\bpatisserie\\b|\\bespresso\\b|\\broasters?\\b|\\bjuice\\s*bar\\b|\\bfood\\s*(court|hall)\\b|\\btavern\\b|\\bcanteen\\b",
    "food-dining",
  ],
  // A vending machine is a $3 snack rather than a meal, but it is still
  // discretionary food — and it is the single most frequent line on these
  // statements, so leaving it unmatched means forty untagged rows a quarter.
  ["vending\\b|\\bsnack\\s*machine\\b", "food-dining", PRIORITY.seedBroad],
  // Half the takeaway on these statements is named by its cuisine and
  // nothing else — "GOLDEN HOUSE CHINESE TA", "SQ *MALAYSIAN HAWKER".
  [
    "\\b(chinese|malaysian|hawker|indian|korean|vietnamese|japanese|mexican|italian|greek|lebanese|curry|tikka)\\b",
    "food-dining",
    PRIORITY.seedBroad,
  ],

  [
    "\\bbp\\b|\\bcaltex\\b|\\bampol\\b|\\bshell\\b|\\b7\\s*-?\\s*eleven\\b|\\b7\\s*/\\s*11\\b|\\bunited\\s*petroleum\\b|\\bpuma\\s*energy\\b|\\bfuel\\b|\\bparking\\b|\\bwilson\\s*park\\b|\\beasypark\\b|\\bcar\\s*wash\\b|\\btransperth\\b|\\bsmartrider\\b|\\btyres?\\b|\\bmechanic\\b|\\bautobarn\\b|\\bsupercheap\\s*auto\\b|\\brepco\\b|\\bauto\\s*classic\\b",
    "transport-fuel-parking-car",
  ],
  // Petrol stations that trade under a supermarket's name match the grocery
  // rule just as well. Without the higher priority they are a tie between two
  // categories, which means every tank of fuel lands in the review queue.
  [
    "\\breddy\\s*express\\b|\\bcoles\\s*express\\b|\\bwoolworths\\s*(petrol|fuel)\\b",
    "transport-fuel-parking-car",
    PRIORITY.seedSpecific,
  ],
  // A dealership charge is usually a service, occasionally a car. Broad,
  // because the difference is thousands of dollars and one of them is a one-off.
  [
    "\\bhonda\\b|\\btoyota\\b|\\bmazda\\b|\\bsubaru\\b|\\bservice\\s*cent(re|er)\\b",
    "transport-fuel-parking-car",
    PRIORITY.seedBroad,
  ],
  ["\\bcar\\s*(loan|finance)\\b|\\bnovated\\b|\\bplenti\\b|\\bmoney3\\b", "transport-car-finance"],

  [
    "\\bpharmacy\\b|\\bchemist\\b|\\bcwh\\b|\\bmedical\\b|\\bdental\\b|\\bdentist\\b|\\bphysio\\w*\\b|\\bpatholog\\w*\\b|\\bclinical\\s*lab\\w*\\b|\\bradiolog\\w*\\b|\\bimaging\\b|\\boptometrist\\b|\\bst\\.?\\s*john\\b|\\burgent\\s*care\\b|\\bmcare\\b|\\bmedicare\\b",
    "medical-out-of-pocket",
  ],
  // A vet is a clinic and a surgery too, so this sits a tier below the pet
  // rules instead of tying with them and sending every vet visit to review.
  [
    "\\bclinic\\w*\\b|\\bsurgery\\b|\\bhealth\\s*cent(re|er)\\b",
    "medical-out-of-pocket",
    PRIORITY.seedBroad,
  ],

  // `\bfitn\w*\b` rather than `\bfitness\b`: the statement truncates the
  // merchant, and "Northside Fitn" is not a different gym.
  [
    "\\bgym\\b|\\bfitn\\w*\\b|\\bf45\\b|\\bpilates\\b|\\byoga\\b|\\bcrossfit\\b|\\bgoodlife\\b",
    "personal-fitness",
  ],
  [
    "\\bhairdress\\w*\\b|\\bbarber\\w*\\b|\\bdry\\s*cle\\w*\\b|\\bnails?\\b|\\bbeauty\\b|\\bmecca\\b|\\bpriceline\\b|\\bsephora\\b",
    "personal-care",
  ],
  [
    "\\buniqlo\\b|\\bkmart\\b|\\btarget\\b|\\bbig\\s*w\\b|\\bcotton\\s*on\\b|\\bh\\s*&\\s*m\\b|\\bzara\\b|\\bthe\\s*iconic\\b|\\bmyer\\b|\\bdavid\\s*jones\\b|\\bshein\\b|\\bbonds\\b|\\bjeanswest\\b",
    "personal-clothing",
  ],
  ["\\brebel\\b|\\bsportsgirl\\b|\\bdecathlon\\b", "personal-clothing", PRIORITY.seedBroad],

  [
    "\\bpet\\s*insurance\\b|\\bpetsure\\b|\\bpetcover\\b|\\bknose\\b|\\bpetplan\\b|\\btrupanion\\b",
    "pet-insurance",
    PRIORITY.seedSpecific,
  ],
  [
    "\\bpetbarn\\b|\\bpet\\s*stock\\b|\\bpetstock\\b|\\bpetco\\b|\\bvet\\b|\\bveterinar\\w*\\b|\\bvetwest\\b|\\banimal\\s*hospital\\b|\\bpet\\s*circle\\b|\\briverside\\s*pets?\\b|\\bpet\\s*(supplies|store|shop|food|grooming)\\b",
    "pet-care",
  ],

  ["\\batm\\b|\\bcash\\s*(withdrawal|out)\\b|\\bwithdrawal\\s*fee\\b", "other-cash-withdrawal"],
  // Streaming, games and general shops that have no category of their own.
  // "Other / Discretionary" is an honest answer to "we don't know which of
  // these it is", and a correction here is one tap that sticks forever.
  [
    "\\bofficeworks\\b|\\bamazon\\b|\\bjb\\s*hi-?\\s*fi\\b|\\bthe\\s*good\\s*guys\\b|\\bplaystation\\b|\\bsony\\s*interactive\\b|\\bnintendo\\b|\\bsteam\\b|\\bstan\\.com\\b|\\bstan\\s*entertainment\\b|\\bspotify\\b|\\bopenai\\b|\\bchatgpt\\b|\\baudible\\b|\\bkindle\\b|\\blotter\\w*\\b|\\bnewsagen\\w*\\b|\\bnextra\\b|\\bbikes?\\b|\\bcycles\\b|\\bcleaning\\b|\\bcleaner\\b",
    "other-discretionary",
    PRIORITY.seedBroad,
  ],

  [
    "\\bsettlement\\b.*\\b(conveyanc\\w*|solicitor|property)\\b|\\bconveyanc\\w*\\b",
    "oneoff-house-settlement",
    PRIORITY.seedSpecific,
  ],
  ["\\bremoval\\w*\\b|\\bmoving\\s*co\\b|\\bman\\s*(with|and)\\s*a?\\s*van\\b", "oneoff-moving"],
  [
    "\\bbunnings\\b|\\bmitre\\s*10\\b|\\bhardware\\b|\\breece\\b|\\btotal\\s*tools\\b",
    "oneoff-home-hardware",
  ],
  [
    "\\bikea\\b|\\bfantastic\\s*furniture\\b|\\bfreedom\\b|\\bnick\\s*scali\\b|\\badairs\\b|\\bbed\\s*bath\\b|\\bspotlight\\b|\\btemple\\s*(and|&)\\s*webster\\b|\\bpillow\\s*talk\\b|\\bearly\\s*settler\\b|\\bamart\\b|\\bharvey\\s*norman\\b",
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
    "\\bcity\\s*of\\s+\\w+\\b|\\bshire\\s*of\\s+\\w+\\b|\\bcouncil\\s*rates\\b|\\bland\\s*tax\\b|\\bdept\\s*of\\s*transport\\b|\\btransport\\s*wa\\b|\\bvehicle\\s*licen[cs]e\\b|\\bdrivers?\\s*licen[cs]e\\b",
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
  // A government fuel or energy rebate is money coming in. At the ordinary
  // tier the word "fuel" alone would file it as a petrol station.
  [
    "\\bfuel\\s*(support|rebate)\\b|\\benergy\\s*rebate\\b|\\bcost\\s*of\\s*living\\s*(rebate|payment)\\b",
    "income-oneoff-other",
    PRIORITY.seedSpecific,
  ],
  ["\\bcashback\\b|\\bcash\\s*back\\b", "income-oneoff-other", PRIORITY.seedBroad],
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
