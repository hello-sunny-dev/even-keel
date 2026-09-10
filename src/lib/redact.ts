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
  // Any bare digit run long enough to identify an account. Dates and amounts
  // are already parsed off the line before this runs.
  [/\b\d{6,}\b/g, " "],
];

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
