import { isInternalTransfer } from "./transfers";

/**
 * What a row means when it is printed on a loan statement.
 *
 * The same words mean different things on the two kinds of account, and the
 * categoriser was only ever shown the description. "TRANSFER RECEIPT TRANSFER
 * FROM", incoming, is a stranger's money on an everyday account — which is why
 * it was deliberately left unmatched — and on a home loan it is the household's
 * own fortnightly repayment arriving. Eighteen identical rows sat in the review
 * queue because nothing told the rules which statement they came from.
 *
 * Everything here is specific to a loan account and is only consulted for one.
 */
export type LoanRow =
  { kind: "transfer" } | { kind: "category"; categoryId: string } | { kind: "unknown" };

const RULES: [RegExp, string][] = [
  // Lenders Mortgage Insurance and the conveyancing fee exist once, at
  // settlement, and only on a mortgage.
  [/\blmi\b|\blenders\s+mortgage\s+insurance\b/i, "oneoff-house-settlement"],
  [/\bsettlement\s+fee\b/i, "oneoff-house-settlement"],
  // The home-loan package fee — a bank charge, annually.
  [/\bannual\s+fee\b|\bpackage\s+fee\b|\bservice\s+fee\b/i, "other-bank-fees"],
  // The actual cost of the mortgage. The repayment is a transfer between their
  // own accounts; this is the part that leaves the household.
  [/\binterest\s+charge\b|\binterest\s+debit\b/i, "mortgage-interest"],
];

export function classifyLoanRow(description: string, amount: number): LoanRow {
  if (isInternalTransfer(description)) return { kind: "transfer" };

  /**
   * Money arriving on a loan account is the repayment, not income.
   *
   * Nothing else pays money *into* a mortgage: a loan account cannot be spent
   * from and nobody is sent wages by it. Counting it as income would inflate
   * every month it lands in by the size of a mortgage payment.
   */
  if (
    amount > 0 &&
    /\btransfer\b|\brepayment\b|\bdirect\s+credit\b|\bdeposit\b/i.test(description)
  ) {
    return { kind: "transfer" };
  }

  for (const [pattern, categoryId] of RULES) {
    if (pattern.test(description)) return { kind: "category", categoryId };
  }

  /**
   * The drawdown itself is left alone on purpose.
   *
   * A single large debit at the start of a loan statement is the money being
   * advanced to buy the house, and it is the one row where being wrong is
   * expensive — so it goes to the review queue with its own amount visible
   * rather than being guessed at from the word "transfer".
   */
  return { kind: "unknown" };
}
