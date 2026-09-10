/**
 * Bank-identifying numbers must never reach the database or the logs, even
 * though they show up in statement text. Everything here runs before a
 * description is persisted; nothing upstream of it is stored.
 */

const PATTERNS: [RegExp, string][] = [
  // 13-19 digit card numbers, however they are grouped.
  [/\b(?:\d[ -]?){13,19}\b/g, " "],
  // "Card 1234", "Card No xxxx5678", "**** 9012"
  [/\bcard\s*(?:no\.?|number)?\s*[x*•]*\s*\d{3,4}\b/gi, " "],
  [/[x*•]{2,}\s*\d{2,6}\b/gi, " "],
  // BSB / account references, with or without the label.
  [/\b(?:bsb|a\/?c|acct|account)\s*(?:no\.?|number)?\s*:?\s*[\d\s-]{5,}/gi, " "],
  [/\b\d{3}\s?-\s?\d{3}\b/g, " "],
  /**
   * Any run of six or more digits, attached to letters or not.
   *
   * The word boundary this used to require meant a reference glued to a name
   * survived: `Oriene1000000001`, `Petsur1000000003`, `ATO000000000000001` all
   * reached the database intact. They are customer reference numbers — the
   * thing this function exists to remove.
   *
   * The same change fixes categorisation, because those references change
   * every month: the merchant key for an Origin Energy bill was
   * `ENERGY HO ORIENE1000000001` in one month and a different string the next,
   * so a rule created in April could never match May. Every recurring direct
   * debit was landing in the review queue forever.
   *
   * Six, not four, so a store number survives — `COLES 0292` and `COLES 0485`
   * are different shops and neither identifies a person.
   */
  [/\d{6,}/g, " "],
];

/**
 * The household's own names, as they appear in their own transactions.
 *
 * A transfer between people prints who sent it: "Osko Deposit - Receipt
 * R Lee & A Morgan", "Ledger Tax INV-1000 Alex Morgan". Generic name
 * detection would eat merchants — "Harbour Cafe By Leeson" is not a person —
 * but a household knows exactly who its members are, so it can say. Given
 * "Jamie Robin Lee" this removes "Robin Lee", "R Lee" and "Lee".
 *
 * Only surnames and initial-plus-surname: a first name alone is too likely to
 * be a shop.
 */
export function nameStripper(fullNames: string[]): (text: string) => string {
  const patterns: RegExp[] = [];

  for (const full of fullNames) {
    const parts = full
      .split(/\s+/)
      .map((p) => p.replace(/[^\p{L}'-]/gu, ""))
      .filter((p) => p.length > 1);
    if (parts.length === 0) continue;

    const surname = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map((p) => p[0]);
    const escaped = surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // "R Lee", "Robin Lee", "A Morgan" — a given name or initial, then the
    // surname. Matched first so the surname-only rule does not cut it short.
    for (const part of [...parts.slice(0, -1), ...initials]) {
      const given = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      patterns.push(new RegExp(`\\b${given}\\.?\\s+${escaped}\\b`, "gi"));
    }
    patterns.push(new RegExp(`\\b${escaped}\\b`, "gi"));
  }

  return (text: string) => {
    let out = text;
    for (const re of patterns) out = out.replace(re, " ");
    return out
      .replace(/\s+/g, " ")
      .replace(/\s+&\s*$/, "")
      .trim();
  };
}

/** Strip account/BSB/card numbers and squash the leftover whitespace. */
export function redactDescription(raw: string): string {
  let out = ` ${raw} `;
  for (const [re, sub] of PATTERNS) out = out.replace(re, sub);
  return out
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:*x•#-]+/i, "")
    .replace(/[\s,;:*•#-]+$/, "")
    .trim();
}

/**
 * Who the statement is addressed to, and where they live.
 *
 * `redactDescription` handles numbers — account, BSB, card. It was never
 * looking at the header block, where a statement prints the account holders'
 * names and their home address in plain text. That is not a number, so nothing
 * caught it, and the diagnostic script printed it under the words "safe to
 * share".
 *
 * Deliberately blunt: over-redacting a header costs a diagnostic nothing,
 * while under-redacting it puts somebody's address in a chat log.
 */
const PERSONAL: [RegExp, string][] = [
  // "Mr Alex Morgan & Mrs Robin Lee"
  [/\b(?:mr|mrs|ms|miss|dr|prof)\b\.?\s+[^,\n]{0,60}/gi, "[name]"],
  // "12 Sample Approach", "3/25 Wellington St"
  [
    /\b\d+[a-z]?(?:\s*\/\s*\d+)?\s+[A-Za-z' ]{2,30}\s(?:approach|street|st|road|rd|avenue|ave|drive|dr|way|court|ct|place|pl|crescent|cres|parade|pde|lane|ln|terrace|tce|boulevard|blvd|close|circuit|cct|grove|gr|rise|loop|entrance|ent|gardens|gdns|highway|hwy)\b\.?/gi,
    "[address]",
  ],
  // "NORTHSIDE, WA 6000" — suburb, state, postcode.
  [/\b[A-Za-z' ]{2,30},?\s+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s+\d{4}\b/g, "[suburb]"],
];

/**
 * Everything `redactDescription` removes, plus names and addresses.
 *
 * For output a person is going to read and paste somewhere. Not used on the
 * persist path: a merchant's own suburb is part of its name there, and
 * stripping it would break the merchant key that categorisation rules match on.
 */
export function redactPersonal(raw: string): string {
  let out = redactDescription(raw);
  for (const [re, sub] of PERSONAL) out = out.replace(re, sub);
  return out.replace(/\s+/g, " ").trim();
}

/** Statement-wide sweep, used on any text that might be surfaced or logged. */
export function redactText(raw: string): string {
  return raw
    .split("\n")
    .map((line) => redactDescription(line))
    .join("\n");
}

const NOISE = [
  /^(?:visa|eftpos|debit|credit)\s+(?:card\s+)?purchase\s*/i,
  /^(?:visa|eftpos)\s+/i,
  /^direct\s+(?:debit|credit)\s*/i,
  /^(?:internal\s+)?transfer\s+(?:to|from)\s*/i,
  /^osko\s+(?:payment|deposit|withdrawal)\s*/i,
  /^bpay\s+(?:bill\s+payment)?\s*/i,
  /^(?:pos|atm)\s+(?:withdrawal|purchase)?\s*/i,
  /^payment\s+(?:to|from)\s*/i,
  /^recurring\s+payment\s*/i,
];

const TRAILING_LOCATION = /\s+(?:au|aus|australia)$/i;

/**
 * A stable key for "this merchant", so a correction made once is reused
 * forever. Bank text pads the real name with payment-rail words, city, state
 * and a reference — strip those and keep what a human would call the shop.
 */
export function merchantKey(description: string): string {
  let s = redactDescription(description).toUpperCase();
  // Rails stack — "VISA DEBIT PURCHASE COLES" wears two of them — so strip
  // until nothing more comes off rather than making one pass in a fixed order.
  for (let pass = 0; pass < NOISE.length; pass++) {
    const before = s;
    for (const re of NOISE) s = s.replace(re, "");
    if (s === before) break;
  }
  s = s
    .replace(/\b(?:ref|reference)\b\s*[:#]?\s*\S*/gi, " ")
    .replace(/\breceipt\b\s*[:#]?\s*\S*/gi, " ")
    .replace(/\bvalue\s+date\s*:?.*$/i, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(/[^A-Z0-9&/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // State suffixes carry no identity — the same shop in two suburbs is one merchant.
  s = s.replace(/\s+(?:NSW|VIC|QLD|WA|SA|TAS|NT|ACT)$/i, "").trim();
  s = s.replace(TRAILING_LOCATION, "").trim();
  // Terminal/store numbers vary between visits to the same shop — dropping them
  // is what lets one correction cover every future transaction from a merchant.
  // Three tokens, not four: a suburb trailing the shop name appears in some
  // descriptions and not others, and a merchant the user has already
  // corrected must not come back as a stranger because of it.
  const key = s
    .split(" ")
    .filter((t) => t && !/^\d+$/.test(t))
    .slice(0, 3)
    .join(" ");
  // Stripping the payment rail can leave nothing behind ("ATM WITHDRAWAL").
  // An empty key would match every other empty key, so fall back to the
  // description itself.
  if (key) return key;
  return redactDescription(description)
    .toUpperCase()
    .replace(/[^A-Z0-9&/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}
