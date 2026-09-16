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
  /**
   * Whether this statement is a loan account rather than a spending account.
   *
   * The same words mean different things on the two. "Transfer from", incoming,
   * is a stranger's money on an everyday account and the household's own
   * repayment on a loan — and it was the largest thing left untagged, eighteen
   * identical fortnightly rows that the categoriser had no way to read because
   * it was only ever shown the description.
   */
  isLoanAccount: boolean;
};

/**
 * Decided from what the statement contains, not from its filename.
 *
 * A loan account charges interest and cannot be spent from; an everyday
 * account is mostly card purchases and has no interest charge on it. Both
 * halves are required, so a spending account that happens to earn interest is
 * not mistaken for a mortgage.
 */
export function looksLikeLoanAccount(transactions: ParsedTransaction[]): boolean {
  const interest = transactions.some((t) => /\binterest\s+charge\b/i.test(t.description));
  const spending = transactions.some((t) =>
    /\bvisa\s+purchase\b|\beftpos\b|\batm\b|\bosko\b/i.test(t.description),
  );
  return interest && !spending;
}

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

/**
 * The same words, anywhere in a line rather than only at the start.
 *
 * "Closing balance" arrived on its own line after the last transaction and was
 * merged into that transaction's description as a wrapped merchant name — so
 * the description was wrong AND the statement lost its closing balance, which
 * is the only thing that can prove nothing was dropped. Three of the five
 * statements reported "no balances to check" because of this.
 */
const BALANCE_WORDS =
  /\b(opening|closing|brought\s+forward|carried\s+forward)\s+balance\b|\bbalance\s+(brought|carried)\b/i;
const CREDIT_WORDS =
  /\b(deposit|salary|payroll|wages|refund|reversal|rebate|credit\s+interest|interest\s+paid|transfer\s+from|received\s+from|payment\s+received|dividend|reimburse\w*)\b/i;
const NON_CONTINUATION =
  /^(page\b|ing\b|www\.|https?:|abn\b|bsb\b|account\s|statement\b|date\s|description\b|balance\b|\d+\s*of\s*\d+$)/i;

/**
 * Page furniture, which belongs to no transaction.
 *
 * The address block and the "send us a secure message" boilerplate sit at the
 * foot of every sheet, so the parser reaches them immediately after the last
 * row on that page and — having no date and no amount — they look exactly like
 * a wrapped description. Real output from a real statement:
 *
 *   PETCO NEWCO PTY LTD GPO Box 4094 Sydney NSW Australia 2001 | www.examplebank.com.au
 *
 * That is not a merchant. It is one contaminated description per page, which
 * is also one wrong merchant key per page, which is a categorisation rule that
 * matches one transaction and never fires again.
 */
const BOILERPLATE =
  /(\bgpo\s+box\b|\bpo\s+box\b|examplebank\.com\.au|\bsecure\s+message\b|\bonline\s+banking\b|\bas\s+soon\s+as\s+possible\b|\babn\b|\bafsl\b|\bterms\s+and\s+conditions\b|\bpage\s+\d+\s+of\s+\d+\b)/i;

/**
 * Cut a description at the first sign of page furniture.
 *
 * The cut lands mid-sentence, because the sentence started on the line before:
 * "CBA Acme Salary" followed by "…send us a secure message via online
 * banking" cuts to "CBA Acme Salary us a". Those two leftover words are
 * enough to change the merchant key, which is what categorisation rules match
 * on — so a trailing run of all-lowercase words goes too. It only runs on a
 * line already known to contain prose, and a real merchant carries a capital
 * somewhere: "Harbour Cafe By Leeson" keeps every word.
 */
export function trimBoilerplate(text: string): string {
  const hit = BOILERPLATE.exec(text);
  if (!hit) return text;

  const cut = text
    .slice(0, hit.index)
    .replace(/[\s|,;:-]+$/, "")
    .trim();

  const words = cut.split(/\s+/);
  while (words.length > 1 && /^[a-z]+$/.test(words[words.length - 1])) words.pop();
  return words.join(" ");
}

type Tail = {
  rest: string;
  /** Magnitude. What the sign should be is decided per column, further down. */
  value: number;
  explicitSign: "-" | "+" | null;
  crdr: "CR" | "DR" | null;
  /**
   * The number as printed, minus sign included.
   *
   * A running balance is not a magnitude — a mortgage's is negative, and
   * throwing the sign away inverts every row on the statement. It went
   * unnoticed because an everyday account's balance is never negative.
   */
  signed: number;
};

/**
 * The first money-shaped token on a line, with its sign.
 *
 * the bank's loan statement lays its summary out in two columns and puts the
 * figures a row above the words that name them:
 *
 *     $412,836.27 DR      $1,426.37
 *     Closing balance     Interest paid this financial year
 *
 * so the closing balance is the *leading* amount of the line before the label,
 * and the trailing one belongs to the other column entirely.
 */
function takeLeadingAmount(line: string): number | null {
  const m = /^\s*(-)?\s*\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s*(-)?\s*(CR|DR)?\b/i.exec(line);
  if (!m) return null;
  const value = Number(m[2].replace(/,/g, ""));
  const negative = m[1] === "-" || m[3] === "-" || (m[4] ?? "").toUpperCase() === "DR";
  // `$0.00 DR` is zero, not negative zero — which reads as "-$0" and misbehaves
  // in any later comparison on the sign.
  return negative && value !== 0 ? -value : value;
}

function takeTrailingAmount(line: string): Tail | null {
  const m = AMOUNT_TAIL.exec(line);
  if (!m) return null;
  const trailingMinus = m[3] === "-";
  const sign = m[1] === "-" || trailingMinus ? "-" : m[1] === "+" ? "+" : null;
  const value = Number(m[2].replace(/,/g, ""));
  const crdr = m[4] ? (m[4].toUpperCase() as "CR" | "DR") : null;
  // A loan statement says a balance is negative by writing DR after it rather
  // than a minus in front of it. `signed` is only ever read for a balance, so
  // taking the marker into account here is what stops the running balance
  // coming back positive — and with it every sign on the statement, since the
  // amounts take their sign from how the balance moved.
  const negative = sign === "-" || crdr === "DR";
  return {
    rest: line.slice(0, m.index).trimEnd(),
    value,
    signed: negative && value !== 0 ? -value : value,
    explicitSign: sign as "-" | "+" | null,
    crdr,
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
 * The labels a statement summary uses, in the order they are written.
 *
 * the bank's everyday statement lays the summary out in four columns, all the
 * labels on one line and all the figures on the next:
 *
 *     Opening balance  Total money in  Total money out  Closing balance
 *     $0.00            $88,412.37     $-80,927.61     $7,484.76
 *
 * One label, one figure, matched by position. Reading only the first or last
 * amount takes the opening balance for the closing one, or the total money out.
 */
const SUMMARY_LABELS =
  /opening balance|closing balance|brought forward|carried forward|total money in|total money out|total credits|total debits|total deposits|total withdrawals/gi;

/** Every money-shaped token on a line, in order, sign included. */
function moneyTokens(line: string): number[] {
  const out: number[] = [];
  const re = /(-)?\$?\s*(-)?((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const value = Number(m[3].replace(/,/g, ""));
    const negative = m[1] === "-" || m[2] === "-";
    out.push(negative && value !== 0 ? -value : value);
  }
  return out;
}

/**
 * Read a multi-column summary block, if there is one.
 *
 * Only fires when a line carries two or more summary labels and a neighbouring
 * line carries exactly as many figures — which is what makes the pairing by
 * position safe. The figures sit below the labels here and above them on the
 * loan statement, so both neighbours are tried.
 */
function readSummaryBlock(lines: string[]): { opening: number | null; closing: number | null } {
  for (let i = 0; i < lines.length; i++) {
    const labels = lines[i].match(SUMMARY_LABELS);
    if (!labels || labels.length < 2) continue;

    for (const neighbour of [lines[i + 1], lines[i - 1]]) {
      if (!neighbour) continue;
      const amounts = moneyTokens(neighbour);
      if (amounts.length !== labels.length) continue;

      let opening: number | null = null;
      let closing: number | null = null;
      labels.forEach((label, column) => {
        if (/opening|brought/i.test(label)) opening = amounts[column];
        else if (/closing|carried/i.test(label)) closing = amounts[column];
      });
      if (opening !== null || closing !== null) return { opening, closing };
    }
  }
  return { opening: null, closing: null };
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
  // A multi-column summary is unambiguous, so it is read first and the
  // line-by-line rules below only fill in what it did not find.
  const summary = readSummaryBlock(lines);
  let openingBalance: number | null = summary.opening;
  let closingBalance: number | null = summary.closing;
  // A column summary names its figures outright. The line-by-line rules below
  // are guesses by comparison — they fill in what the summary did not find and
  // never overwrite what it did.
  const fromSummary = { opening: summary.opening !== null, closing: summary.closing !== null };
  let pendingBalance: "opening" | "closing" | null = null;
  let previousLine: string | null = null;

  for (const line of lines) {
    const wasPrevious = previousLine;
    previousLine = line;
    const dateHit = takeLeadingDate(line);

    if (!dateHit) {
      const tail = takeTrailingAmount(line);

      // A label with no number on it. The amount is on one side or the other:
      // the bank's loan statement prints the figure first and labels it underneath
      //
      //     $412,836.27 DR      $1,426.37
      //     Closing balance     Interest paid this financial year
      //
      // while the everyday statement puts the label first. Take whichever of
      // the two neighbouring amount-only lines exists.
      if (!tail && BALANCE_WORDS.test(line)) {
        const which = /opening|brought/i.test(line) ? "opening" : "closing";
        const above = wasPrevious === null ? null : takeLeadingAmount(wasPrevious);
        if (above !== null) {
          if (which === "opening") {
            if (!fromSummary.opening) openingBalance = above;
            prevBalance = above;
          } else if (!fromSummary.closing) {
            closingBalance = above;
          }
        } else {
          // Nothing above it: the amount must be on the line below.
          pendingBalance = which;
        }
        continue;
      }
      if (tail && !tail.rest && pendingBalance) {
        if (pendingBalance === "opening") {
          if (!fromSummary.opening) openingBalance = tail.signed;
          prevBalance = tail.signed;
        } else if (!fromSummary.closing) {
          closingBalance = tail.signed;
        }
        pendingBalance = null;
        continue;
      }
      pendingBalance = null;

      if (tail && BALANCE_LINE.test(tail.rest)) {
        if (/^opening|brought/i.test(tail.rest)) {
          if (!fromSummary.opening) openingBalance = tail.signed;
          prevBalance = tail.signed;
        } else if (!fromSummary.closing) {
          closingBalance = tail.signed;
        }
        continue;
      }
      // Wrapped description: statements break long merchant text onto a
      // second line with no date and no amount.
      const last = transactions[transactions.length - 1];
      if (
        last &&
        !tail &&
        line.length <= 60 &&
        !NON_CONTINUATION.test(line) &&
        !BOILERPLATE.test(line) &&
        !BALANCE_WORDS.test(line)
      ) {
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
    const balance = second ? first.signed : null;
    const body = amountTail.rest;

    if (BALANCE_LINE.test(body)) {
      if (/^opening|brought/i.test(body)) {
        if (!fromSummary.opening) openingBalance = amountTail.signed;
        prevBalance = amountTail.signed;
      } else if (!fromSummary.closing) {
        closingBalance = amountTail.signed;
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

    const description = trimBoilerplate(redactDescription(body));
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

  /**
   * A statement whose every sign is inverted, caught by its own balances.
   *
   * the bank's loan statement prints the running balance as the size of the debt,
   * with no minus and no DR on the transaction rows — so a drawdown that takes
   * the balance from 0 to 393,611.43 looks, to anything reading the delta,
   * exactly like money arriving. All eighteen rows came out backwards and the
   * drift was $825,672.54: twice the closing balance, which is the shape an
   * inverted sum always has.
   *
   * Rather than guess which accounts do this, try it: if the statement does
   * not reconcile as parsed but reconciles exactly when every amount is
   * negated, then the balance column was a magnitude. The statement's own
   * opening and closing figures are the proof, so this cannot fire on a
   * statement that was already right — and it says so in a warning, because a
   * silent sign flip is not something anybody should have to discover.
   */
  if (openingBalance !== null && closingBalance !== null && transactions.length > 0) {
    const cents = (n: number) => Math.round(n * 100);
    const moved = transactions.reduce((sum, t) => sum + cents(t.amount), 0);
    const gap = cents(openingBalance) + moved - cents(closingBalance);

    if (gap !== 0 && cents(openingBalance) - moved - cents(closingBalance) === 0) {
      for (const t of transactions) t.amount = t.amount === 0 ? 0 : -t.amount;
      warnings.push(
        "Every amount was the wrong way round against this statement's own balances — " +
          "its balance column counts up as the debt grows. All signs have been flipped, " +
          "and it now reconciles.",
      );
    }
  }

  return {
    transactions,
    openingBalance,
    closingBalance,
    skipped,
    warnings,
    isLoanAccount: looksLikeLoanAccount(transactions),
  };
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
