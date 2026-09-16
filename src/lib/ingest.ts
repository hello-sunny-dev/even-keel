import { effectiveKind } from "./aggregate";
import { isInternalTransfer } from "./transfers";
import { classifyLoanRow } from "./loan-statement";
import { merchantKey } from "./redact";
import { categorize } from "./categorize";
import { lookUp, type Categories } from "./categories";
import type { InsertableTransaction } from "./db/queries";
import type { ParseResult, ParsedTransaction } from "./parse/statement";
import type { Rule } from "./rules";

/**
 * A parsed row, decorated with everything the confirm table needs and nothing
 * it does not. Held in the browser until the user presses Import — the point
 * of the confirm step is that a misparse can be corrected before it becomes
 * data.
 */
export type ProposedTransaction = {
  sourceFingerprint: string;
  date: string;
  month: string;
  description: string;
  merchantKey: string;
  amount: number;
  balance: number | null;
  categoryId: string | null;
  oneOff: boolean;
  kind: "income" | "expense" | "transfer";
  /** Which file it came from, so a suspicious row can be traced back. */
  sourceFile: string;
  duplicate: boolean;
  include: boolean;
};

export type FileReport = {
  name: string;
  transactions: number;
  openingBalance: number | null;
  closingBalance: number | null;
  /** Opening + every movement − closing. Zero means nothing was dropped. */
  drift: number | null;
  skipped: string[];
  warnings: string[];
};

export function proposeFrom(
  result: ParseResult,
  sourceFile: string,
  categories: Categories,
  rules: Rule[] = [],
  /**
   * Removes the household's own names before anything is stored. A transfer
   * between people prints who sent it, and nobody needs their own name in
   * three hundred rows of their own ledger.
   */
  stripNames: (text: string) => string = (text) => text,
): ProposedTransaction[] {
  return result.transactions.map((t) =>
    propose(t, sourceFile, categories, rules, stripNames, result.isLoanAccount),
  );
}

function propose(
  t: ParsedTransaction,
  sourceFile: string,
  categories: Categories,
  rules: Rule[],
  stripNames: (text: string) => string,
  isLoanAccount = false,
): ProposedTransaction {
  const description = stripNames(t.description) || t.description;

  // The statement this row came off decides what its words mean, so it is
  // read first. On an everyday account "transfer from" is a stranger; on a
  // loan account it is the household's own repayment.
  const loan = isLoanAccount
    ? classifyLoanRow(description, t.amount)
    : { kind: "unknown" as const };

  // Asked before the category is, because a transfer has no category and
  // giving it one would put it back into a total it must stay out of.
  const transfer = loan.kind === "transfer" || isInternalTransfer(description);
  const match = transfer ? null : categorize(description, categories, rules);
  const fromLoan = loan.kind === "category" && lookUp(categories, loan.categoryId) ? loan : null;
  const categoryId = transfer
    ? null
    : (fromLoan?.categoryId ?? (match?.status === "matched" ? match.categoryId : null));
  const category = lookUp(categories, categoryId);

  return {
    sourceFingerprint: t.sourceFingerprint,
    date: t.date,
    month: t.month,
    description,
    merchantKey: merchantKey(description),
    amount: t.amount,
    balance: t.balance,
    categoryId,
    oneOff: category?.oneOff ?? false,
    // The category decides, so a refund stays an expense. The sign is only
    // the fallback for a row nothing matched.
    kind: transfer ? "transfer" : (category?.kind ?? (t.amount > 0 ? "income" : "expense")),
    sourceFile,
    duplicate: false,
    include: true,
  };
}

/** Opening + every movement must land on closing. Null when a balance is missing. */
export function drift(result: ParseResult): number | null {
  if (result.openingBalance === null || result.closingBalance === null) return null;
  const moved = result.transactions.reduce((sum, t) => sum + Math.round(t.amount * 100), 0);
  return (
    (Math.round(result.openingBalance * 100) + moved - Math.round(result.closingBalance * 100)) /
    100
  );
}

export function reportFor(result: ParseResult, name: string): FileReport {
  return {
    name,
    transactions: result.transactions.length,
    openingBalance: result.openingBalance,
    closingBalance: result.closingBalance,
    drift: drift(result),
    skipped: result.skipped,
    warnings: result.warnings,
  };
}

/**
 * Consecutive statements overlap at their boundaries, so the same transaction
 * genuinely arrives twice. Keep the first and mark the rest, rather than
 * dropping them silently — the confirm table should be able to say why a row
 * is not being imported.
 */
export function markDuplicatesWithin(rows: ProposedTransaction[]): ProposedTransaction[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (seen.has(row.sourceFingerprint)) return { ...row, duplicate: true, include: false };
    seen.add(row.sourceFingerprint);
    return row;
  });
}

export function markAlreadyImported(
  rows: ProposedTransaction[],
  existing: Set<string>,
): ProposedTransaction[] {
  return rows.map((row) =>
    existing.has(row.sourceFingerprint) ? { ...row, duplicate: true, include: false } : row,
  );
}

/**
 * Statements laid end to end: each one's opening balance should equal the
 * previous one's closing balance. A gap means a statement is missing, an
 * overlap means one is counted twice — and neither is visible from a single
 * file.
 */
export function chainGaps(reports: FileReport[]): string[] {
  const ordered = [...reports].filter(
    (r) => r.openingBalance !== null && r.closingBalance !== null,
  );
  const gaps: string[] = [];

  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    const difference = Math.round((current.openingBalance! - previous.closingBalance!) * 100) / 100;
    if (difference !== 0) {
      gaps.push(
        `${previous.name} closes at ${previous.closingBalance!.toFixed(2)} but ${current.name} ` +
          `opens at ${current.openingBalance!.toFixed(2)} — a statement is missing or these overlap.`,
      );
    }
  }

  return gaps;
}

/** The confirm table's rows, as the database wants them. */
export function toInsertable(
  rows: ProposedTransaction[],
  source: "csv" | "pdf" | "manual",
  categories: Categories,
): InsertableTransaction[] {
  return rows
    .filter((row) => row.include && !row.duplicate)
    .map((row) => ({
      date: row.date,
      month: row.date.slice(0, 7),
      description: row.description,
      merchantKey: row.merchantKey,
      amount: row.amount,
      balance: row.balance,
      // Recomputed rather than taken from the request: the confirm table lets
      // the category be changed, and kind must follow it.
      kind: effectiveKind(row, categories),
      categoryId: row.categoryId,
      oneOffOverride: row.categoryId
        ? row.oneOff === (lookUp(categories, row.categoryId)?.oneOff ?? false)
          ? null
          : row.oneOff
        : row.oneOff || null,
      // A transfer has no category and never needs one, so it must not be
      // counted as an unanswered question in the review queue.
      needsReview: row.categoryId === null && effectiveKind(row, categories) !== "transfer",
      source,
      sourceFingerprint: row.sourceFingerprint,
    }));
}
