import { lookUp, type Categories, type Category, type CategoryGroup } from "./categories";
import { negated, sumAmounts } from "./money";
import { cadenceInDays } from "./cadence";
import { addMonths, monthIndex, monthRange } from "./months";
import type { SavingsPlan } from "./savings";

export type Txn = {
  id: string;
  date: string;
  month: string;
  description: string;
  amount: number;
  /**
   * What the row is, as recorded at import. The category is the authority for
   * income against expense; this is the fallback for an untagged row, and the
   * only place a transfer is marked.
   */
  kind: TxnKind;
  categoryId: string | null;
  /** Per-transaction override; null falls back to the category default. */
  oneOffOverride: boolean | null;
  needsReview: boolean;
  /** A transaction that has been split — its children carry the amounts. */
  isSplitParent: boolean;
};

export type TxnKind = "income" | "expense" | "transfer";

/** One-off is a flag on the data, resolved per transaction, never a name convention. */
export function isOneOff(
  txn: Pick<Txn, "categoryId" | "oneOffOverride">,
  categories: Categories,
): boolean {
  if (txn.oneOffOverride !== null) return txn.oneOffOverride;
  return lookUp(categories, txn.categoryId)?.oneOff ?? false;
}

/**
 * Income or expense, decided by the category rather than by the sign.
 *
 * A $60 Woolworths refund is a positive amount in an expense category. Reading
 * the sign calls it income, which raises the month's income, raises core
 * income, and moves every scenario in the ladder — for money that was never
 * earned. The category knows what the row is; the sign only knows which way it
 * moved.
 *
 * A transfer is neither, and is marked on the transaction because no category
 * can tell that moving $500 to a savings account is not spending it.
 */
export function effectiveKind(
  txn: Pick<Txn, "kind" | "categoryId" | "amount">,
  categories: Categories,
): TxnKind {
  if (txn.kind === "transfer") return "transfer";
  return lookUp(categories, txn.categoryId)?.kind ?? txn.kind;
}

export function countable(txns: Txn[]): Txn[] {
  return txns.filter((t) => !t.isSplitParent);
}

export function forMonth(txns: Txn[], month: string): Txn[] {
  return countable(txns).filter((t) => t.month === month);
}

export type MonthlySummary = {
  month: string;
  totalIncome: number;
  /** Income excluding one-off credits — the figure surplus planning should use. */
  coreIncome: number;
  oneOffIncome: number;
  totalSpent: number;
  recurringSpent: number;
  oneOffSpent: number;
  actualSaved: number;
  requiredSaving: number;
  vsPlan: number;
  passed: boolean;
  needsReviewCount: number;
  transactionCount: number;
};

export function monthlySummary(
  txns: Txn[],
  month: string,
  categories: Categories,
  plan?: Pick<SavingsPlan, "monthlyAmount"> | null,
): MonthlySummary {
  const rows = forMonth(txns, month);
  const income = rows.filter((t) => effectiveKind(t, categories) === "income");
  // Signed, not filtered by sign: a refund is a positive amount in an expense
  // category and must come off that month's spending rather than be dropped.
  const spend = rows.filter((t) => effectiveKind(t, categories) === "expense");

  const totalIncome = sumAmounts(income.map((t) => t.amount));
  const oneOffIncome = sumAmounts(
    income.filter((t) => isOneOff(t, categories)).map((t) => t.amount),
  );
  const totalSpent = negated(sumAmounts(spend.map((t) => t.amount)));
  const oneOffSpent = negated(
    sumAmounts(spend.filter((t) => isOneOff(t, categories)).map((t) => t.amount)),
  );

  const actualSaved = Number((totalIncome - totalSpent).toFixed(2));
  const requiredSaving = plan?.monthlyAmount ?? 0;
  const vsPlan = Number((actualSaved - requiredSaving).toFixed(2));

  return {
    month,
    totalIncome,
    coreIncome: Number((totalIncome - oneOffIncome).toFixed(2)),
    oneOffIncome,
    totalSpent,
    recurringSpent: Number((totalSpent - oneOffSpent).toFixed(2)),
    oneOffSpent,
    actualSaved,
    requiredSaving,
    vsPlan,
    passed: vsPlan >= 0,
    needsReviewCount: rows.filter((t) => t.needsReview).length,
    transactionCount: rows.length,
  };
}

export type CategoryRow = {
  categoryId: string;
  name: string;
  group: CategoryGroup;
  oneOff: boolean;
  actual: number;
  target: number | null;
  variance: number | null;
};

export function categoryBreakdown(
  txns: Txn[],
  month: string,
  categories: Categories,
  targets: Map<string, number> = new Map(),
): CategoryRow[] {
  // Income has no target and belongs to the summary, not to a table of what
  // was spent — salary would otherwise sit at the top of every month. Dropped
  // here rather than after totalling, so a refund nets against its own
  // category instead of being mistaken for income and removed.
  const rows = forMonth(txns, month).filter(
    (t) => t.categoryId && effectiveKind(t, categories) === "expense",
  );
  const totals = new Map<string, number>();
  for (const t of rows) {
    const key = t.categoryId!;
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }

  return [...totals.entries()]
    .map(([categoryId, signed]) => {
      const category = lookUp(categories, categoryId);
      // Negated, not absolute: a category refunded more than it was charged
      // in a month spent a negative amount, and should read that way.
      const actual = negated(Number(signed.toFixed(2)));
      const target = targets.get(categoryId) ?? null;
      return {
        categoryId,
        name: category?.name ?? categoryId,
        group: category?.group ?? ("Other" as CategoryGroup),
        oneOff: category?.oneOff ?? false,
        actual,
        target,
        variance: target === null ? null : Number((actual - target).toFixed(2)),
      };
    })
    .sort((a, b) => b.actual - a.actual);
}

export type RecurringRate = {
  categoryId: string;
  rate: number;
  basis: "confirmed" | "trailing";
  monthsUsed: number;
  monthsAvailable: number;
  cadenceMonths: number;
  /** Fewer months of history than one billing cycle — the average is not trustworthy yet. */
  insufficientHistory: boolean;
  /** Recently started; a trailing average will understate it until it settles. */
  newlyStarted: boolean;
};

/**
 * Monthly run rate for a recurring category.
 *
 * Two things the spreadsheet got wrong are fixed here. A category that bills
 * every N months is averaged over a whole number of billing cycles, so a
 * window that happens to miss a bill does not halve the figure. And a
 * confirmed rate — what the user says the bill actually is — always wins over
 * the trailing average, which is what a brand-new cost needs.
 */
export function recurringMonthlyRate(
  txns: Txn[],
  category: Category,
  categories: Categories,
  opts: { asOfMonth: string; windowMonths?: number; confirmedRate?: number | null },
): RecurringRate {
  // Align the window to whole billing cycles, in months, rounding a
  // fortnightly or weekly rhythm up to 1 — sub-monthly items bill at least
  // once a month, so no alignment is needed for them.
  const cadence = Math.max(1, Math.round(cadenceInDays(category.cadence) / (365.25 / 12)));
  const rows = countable(txns).filter(
    (t) =>
      t.categoryId === category.id &&
      effectiveKind(t, categories) === "expense" &&
      monthIndex(t.month) <= monthIndex(opts.asOfMonth),
  );

  const firstMonth = rows.reduce<string | null>(
    (min, t) => (min === null || t.month < min ? t.month : min),
    null,
  );
  const monthsAvailable = firstMonth ? monthIndex(opts.asOfMonth) - monthIndex(firstMonth) + 1 : 0;

  if (opts.confirmedRate !== null && opts.confirmedRate !== undefined) {
    return {
      categoryId: category.id,
      rate: opts.confirmedRate,
      basis: "confirmed",
      monthsUsed: 0,
      monthsAvailable,
      cadenceMonths: cadence,
      insufficientHistory: false,
      newlyStarted: monthsAvailable > 0 && monthsAvailable < cadence * 3,
    };
  }

  const window = Math.min(opts.windowMonths ?? 12, Math.max(monthsAvailable, 0));
  const aligned = Math.floor(window / cadence) * cadence;
  const monthsUsed = aligned > 0 ? aligned : window;
  const insufficientHistory = aligned === 0;

  if (monthsUsed === 0) {
    return {
      categoryId: category.id,
      rate: 0,
      basis: "trailing",
      monthsUsed: 0,
      monthsAvailable,
      cadenceMonths: cadence,
      insufficientHistory: true,
      newlyStarted: false,
    };
  }

  const from = addMonths(opts.asOfMonth, -(monthsUsed - 1));
  const inWindow = rows.filter((t) => t.month >= from);
  const total = negated(sumAmounts(inWindow.map((t) => t.amount)));

  return {
    categoryId: category.id,
    rate: Number((total / monthsUsed).toFixed(2)),
    basis: "trailing",
    monthsUsed,
    monthsAvailable,
    cadenceMonths: cadence,
    insufficientHistory,
    // Under three billing cycles of history, a trailing average is a guess.
    newlyStarted: monthsAvailable < cadence * 3,
  };
}

export type TrendPoint = {
  month: string;
  income: number;
  coreIncome: number;
  recurringSpent: number;
  oneOffSpent: number;
  totalSpent: number;
  saved: number;
  cumulativeNet: number;
};

export function trendSeries(txns: Txn[], categories: Categories, months?: string[]): TrendPoint[] {
  const rows = countable(txns);
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  const span = months ?? monthRange(sorted[0].month, sorted[sorted.length - 1].month);

  let cumulative = 0;
  return span.map((month) => {
    const s = monthlySummary(rows, month, categories, null);
    cumulative = Number((cumulative + s.actualSaved).toFixed(2));
    return {
      month,
      income: s.totalIncome,
      coreIncome: s.coreIncome,
      recurringSpent: s.recurringSpent,
      oneOffSpent: s.oneOffSpent,
      totalSpent: s.totalSpent,
      saved: s.actualSaved,
      cumulativeNet: cumulative,
    };
  });
}

export function groupSeries(
  txns: Txn[],
  categories: Categories,
  months: string[],
): { month: string; [group: string]: number | string }[] {
  const rows = countable(txns).filter(
    (t) => effectiveKind(t, categories) === "expense" && !isOneOff(t, categories),
  );
  return months.map((month) => {
    const point: { month: string; [group: string]: number | string } = { month };
    for (const t of rows.filter((r) => r.month === month)) {
      const group = lookUp(categories, t.categoryId)?.group ?? "Other";
      point[group] = Number((((point[group] as number | undefined) ?? 0) - t.amount).toFixed(2));
    }
    return point;
  });
}

export function availableMonths(txns: Txn[]): string[] {
  return [...new Set(countable(txns).map((t) => t.month))].sort((a, b) => b.localeCompare(a));
}
