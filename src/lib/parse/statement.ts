import { merchantKey, redactDescription } from "../redact";

export type SignSource = "explicit" | "cr_dr" | "balance" | "keyword";

export type ParsedTransaction = {
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM */
  month: string;
  /** Already redacted — safe to persist. */
  description: string;
  merchantKey: string;
  /** Negative = money out, positive = money in. */
  amount: number;
  balance: number | null;
  signSource: SignSource;
  /**
   * Identity of this row *as the statement printed it*. Computed here from
   * parsed values and never recomputed: a user correcting a misparsed amount
   * in the confirm table must not change what the row is, or re-importing the
   * same statement would insert the uncorrected version alongside it as
   * something new.
   */
  sourceFingerprint: string;
};

export type ParseResult = {
  transactions: ParsedTransaction[];
  openingBalance: number | null;
  closingBalance: number | null;
  /** Redacted lines that looked dated but carried no amount. Diagnostics only. */
  skipped: string[];
  warnings: string[];
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DATE_SLASH = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/;
const DATE_SLASH_NO_YEAR = /^(\d{1,2})[/.](\d{1,2})(?!\d)(?![/.]\d)/;
const DATE_NAMED = /^(\d{1,2})[\s-]*([A-Za-z]{3,4})[\s-]*(\d{4}|\d{2})?\b/;

const AMOUNT_TAIL =
  /\s*(?:([-+])\s*)?\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s*(-)?\s*(CR|DR)?$/i;

const BALANCE_LINE = /^(opening|closing|total|brought\s+forward|carried\s+forward|balance)\b/i;
const CREDIT_WORDS =
  /\b(deposit|salary|payroll|wages|refund|reversal|rebate|credit\s+interest|interest\s+paid|transfer\s+from|received\s+from|payment\s+received|dividend|reimburse\w*)\b/i;
const NON_CONTINUATION =
  /^(page\b|ing\b|www\.|https?:|abn\b|bsb\b|account\s|statement\b|date\s|description\b|balance\b|\d+\s*of\s*\d+$)/i;

type Tail = {
  rest: string;
  value: number;
  explicitSign: "-" | "+" | null;
  crdr: "CR" | "DR" | null;
};

function takeTrailingAmount(line: string): Tail | null {
  const m = AMOUNT_TAIL.exec(line);
  if (!m) return null;
  const trailingMinus = m[3] === "-";
  const sign = m[1] === "-" || trailingMinus ? "-" : m[1] === "+" ? "+" : null;
  return {
    rest: line.slice(0, m.index).trimEnd(),
    value: Number(m[2].replace(/,/g, "")),
    explicitSign: sign as "-" | "+" | null,
    crdr: m[4] ? (m[4].toUpperCase() as "CR" | "DR") : null,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function fullYear(raw: string): number {
  const n = Number(raw);
  return raw.length === 2 ? 2000 + n : n;
}

type DateHit = { day: number; month: number; year: number | null; rest: string };

function takeLeadingDate(line: string): DateHit | null {
  let m = DATE_SLASH.exec(line);
  if (m) {
    return {
      day: Number(m[1]),
      month: Number(m[2]),
      year: fullYear(m[3]),
      rest: line.slice(m[0].length),
    };
  }
  m = DATE_NAMED.exec(line);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) {
      return {
        day: Number(m[1]),
        month: mon,
        year: m[3] ? fullYear(m[3]) : null,
        rest: line.slice(m[0].length),
      };
    }
  }
  m = DATE_SLASH_NO_YEAR.exec(line);
  if (m) {
    return { day: Number(m[1]), month: Number(m[2]), year: null, rest: line.slice(m[0].length) };
  }
  return null;
}

/** Best-effort year for statements that print `DD/MM` with the year only in the header. */
export function extractStatementYear(lines: string[]): number | null {
  const head = lines.slice(0, 40).join(" ");
  const labelled =
    /(?:statement\s+period|period|for\s+the\s+period|issued)[^\n]{0,80}?\b(20\d{2})\b/i.exec(head);
  if (labelled) return Number(labelled[1]);
  const any = /\b(20\d{2})\b/.exec(head);
  return any ? Number(any[1]) : null;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/**
 * Turn reconstructed statement lines into transactions.
 *
 * Deliberately tolerant about layout: a line qualifies as a transaction when
 * it starts with a date and ends with at least one money-shaped token. When
 * the line carries a running balance, the balance delta decides the sign —
 * which is what makes two-column (debit/credit) statements parse correctly
 * even though column position is lost when a PDF is flattened to text.
 */
export function parseStatementText(
  text: string,
  opts: { statementYear?: number; fallbackYear?: number } = {},
): ParseResult {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/ /g, " ").trim())
    .filter(Boolean);

  const transactions: ParsedTransaction[] = [];
  const seen = new Map<string, number>();
  const skipped: string[] = [];
  const warnings: string[] = [];

  const headerYear = opts.statementYear ?? extractStatementYear(lines);
  // Never guess the year from the server clock: importing last year's DD/MM
  // statement in January would file every row twelve months out, silently.
  // Fall back only to what the caller supplied, and say so loudly.
  const statementYear = headerYear ?? opts.fallbackYear ?? null;
  if (headerYear === null) {
    warnings.push(
      statementYear === null
        ? "No year found in this statement. Dates are unusable until a year is supplied."
        : `No year found in this statement — assuming ${statementYear}. Check the dates before importing.`,
    );
  }
  let year = statementYear ?? 0;
  let prevMonth: number | null = null;
  let prevBalance: number | null = null;
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;

  for (const line of lines) {
    const dateHit = takeLeadingDate(line);

    if (!dateHit) {
      const tail = takeTrailingAmount(line);
      if (tail && BALANCE_LINE.test(tail.rest)) {
        if (/^opening|brought/i.test(tail.rest)) {
          openingBalance = tail.value;
          prevBalance = tail.value;
        } else {
          closingBalance = tail.value;
        }
        continue;
      }
      // Wrapped description: statements break long merchant text onto a
      // second line with no date and no amount.
      const last = transactions[transactions.length - 1];
      if (last && !tail && line.length <= 60 && !NON_CONTINUATION.test(line)) {
        const merged = `${last.description} ${redactDescription(line)}`.replace(/\s+/g, " ").trim();
        last.description = merged;
        last.merchantKey = merchantKey(merged);
      }
      continue;
    }

    const first = takeTrailingAmount(dateHit.rest);
    if (!first) {
      skipped.push(redactDescription(line));
      continue;
    }
    const second = takeTrailingAmount(first.rest);
    const amountTail = second ?? first;
    const balance = second ? first.value : null;
    const body = amountTail.rest;

    if (BALANCE_LINE.test(body)) {
      if (/^opening|brought/i.test(body)) {
        openingBalance = amountTail.value;
        prevBalance = amountTail.value;
      } else {
        closingBalance = amountTail.value;
      }
      continue;
    }

    // Statements that omit the year roll over mid-file when December is
    // followed by January.
    if (dateHit.year === null) {
      if (prevMonth !== null && dateHit.month < prevMonth - 6) year += 1;
    } else {
      year = dateHit.year;
    }
    prevMonth = dateHit.month;

    const date = year > 0 ? isoDate(year, dateHit.month, dateHit.day) : null;
    if (!date) {
      warnings.push(`Unreadable date on a line — skipped: ${redactDescription(line).slice(0, 40)}`);
      continue;
    }

    let signed: number;
    let signSource: SignSource;
    if (amountTail.explicitSign) {
      signed = amountTail.explicitSign === "-" ? -amountTail.value : amountTail.value;
      signSource = "explicit";
    } else if (amountTail.crdr) {
      signed = amountTail.crdr === "CR" ? amountTail.value : -amountTail.value;
      signSource = "cr_dr";
    } else if (
      balance !== null &&
      prevBalance !== null &&
      near(prevBalance + amountTail.value, balance)
    ) {
      signed = amountTail.value;
      signSource = "balance";
    } else if (
      balance !== null &&
      prevBalance !== null &&
      near(prevBalance - amountTail.value, balance)
    ) {
      signed = -amountTail.value;
      signSource = "balance";
    } else {
      signed = CREDIT_WORDS.test(body) ? amountTail.value : -amountTail.value;
      signSource = "keyword";
    }

    const description = redactDescription(body);
    if (!description) {
      skipped.push(redactDescription(line));
      continue;
    }

    const row: ParsedTransaction = {
      date,
      month: date.slice(0, 7),
      description,
      merchantKey: merchantKey(body),
      amount: Number(signed.toFixed(2)),
      balance,
      signSource,
      sourceFingerprint: "",
    };
    // Two identical charges on one day are real; count them so they stay two.
    const repeatKey = `${row.date}|${row.description}|${row.amount}`;
    const occurrence = (seen.get(repeatKey) ?? 0) + 1;
    seen.set(repeatKey, occurrence);
    row.sourceFingerprint = transactionFingerprint(row, occurrence);
    transactions.push(row);

    if (balance !== null) prevBalance = balance;
    else if (prevBalance !== null) prevBalance = Number((prevBalance + signed).toFixed(2));
  }

  if (transactions.length === 0) {
    warnings.push("No transactions found — the statement layout may not be recognised.");
  }

  return { transactions, openingBalance, closingBalance, skipped, warnings };
}

/**
 * Stable identity for a row, so re-uploading a statement cannot double-count.
 *
 * Date, text and amount alone are not enough: two $4.49 Apple charges on the
 * same day are a real thing, and collapsing them loses money quietly. The
 * running balance separates them when the statement prints one; when it does
 * not, the occurrence index within the statement does.
 */
export function transactionFingerprint(
  t: Pick<ParsedTransaction, "date" | "description" | "amount" | "balance">,
  occurrence = 1,
): string {
  const text = t.description.toUpperCase().replace(/\s+/g, " ");
  const tail = t.balance !== null ? t.balance.toFixed(2) : `#${occurrence}`;
  return `${t.date}|${text}|${t.amount.toFixed(2)}|${tail}`;
}
