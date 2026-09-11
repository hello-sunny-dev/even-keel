/**
 * Moving $500 from the everyday account to the savings account is not spending
 * $500, and it is not earning $500 either. Both sides land in the ledger when
 * both statements are imported, so left alone one transfer becomes a month
 * with $500 of phantom spending and $500 of phantom income — and "actual
 * saved", the number this whole app exists to produce, is wrong twice over.
 *
 * No category can say this, because the same $500 in the same category is a
 * real expense when it leaves the household. It is a property of the
 * transaction, which is why `kind` lives on the row.
 *
 * The list below is deliberately short. Marking a real payment as a transfer
 * hides it from every total silently, which is worse than leaving a transfer
 * in the review queue where it is visible — so only the bank's own wording for
 * a move between a customer's own accounts counts here. "Transfer From", with
 * the account number redacted away, could be either, and stays a question.
 */
const INTERNAL = [
  // "Internal Transfer - Receipt Transfer To", "Internal Transfer - Receipt To
  // Everyday Account" — the bank has already said it never left.
  /\binternal\s+transfer\b/i,
  // "To my Savings Maximiser" — how the bank labels a transfer a customer makes
  // between accounts they own.
  /\b(?:to|from)\s+my\b/i,
  // On the home-loan statement, the repayment arriving from the everyday
  // account. Its other half is a debit on the everyday statement.
  /\brepayment\b\s*[-–]\s*direct\s+credit\b/i,
];

export function isInternalTransfer(description: string): boolean {
  return INTERNAL.some((re) => re.test(description));
}
