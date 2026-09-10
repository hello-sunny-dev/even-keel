/**
 * Reading a statement's filename without repeating what is in it.
 *
 * Banks name a statement after the account it belongs to — the bank's are
 * `Bank_Everyday_1122334455_2026-07-01_2026-09-06.pdf` — so anything that
 * prints a filename is printing an account number. The diagnostic script
 * promises its output is safe to paste into a chat, and it has to be true.
 */

/** Mask any run of six or more digits, keeping the last four to tell files apart. */
export function safeName(name: string): string {
  return name.replace(/\d{6,}/g, (digits) => "••••" + digits.slice(-4));
}

/**
 * Which account a statement belongs to.
 *
 * Statements from one account lay end to end and their balances should chain;
 * two accounts run in parallel and chaining one to the other is meaningless —
 * an everyday account closing at $5,210 against a savings account opening at
 * $412,836 is not a missing statement. Everything before the first date in the
 * name identifies the account.
 */
export function accountOf(name: string): string {
  return safeName(name.replace(/\.[a-z0-9]+$/i, "").replace(/_\d{4}-\d{2}-\d{2}.*$/, ""));
}
