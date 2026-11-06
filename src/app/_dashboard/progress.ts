import { monthlySummary, trendSeries, type Txn } from "@/lib/aggregate";
import { goalProgress, type Goal } from "@/lib/goals";
import { monthIndex } from "@/lib/months";

/**
 * Cash on hand as the ledger understands it: where the goal started, plus
 * every month kept since.
 *
 * Deliberately not called a balance. Once account snapshots exist they are the
 * authority and this becomes the reconciliation against them — the two will
 * differ by timing and by anything that never crossed the imported account,
 * and showing them as rivals is more honest than picking one.
 */
export function progressFromLedger(
  goal: Goal,
  txns: Txn[],
  categories: Parameters<typeof monthlySummary>[2],
  month: string,
) {
  const series = trendSeries(txns, categories);
  const kept = series
    .filter((p) => monthIndex(p.month) >= monthIndex(goal.startMonth) && p.month <= month)
    .reduce((sum, p) => sum + p.saved, 0);
  return goalProgress(goal, goal.openingBalance + kept, month);
}

/** Where to stand the marker, on the same scale the bar is drawn on. */
export function expectedPercent(expected: number, goal: Goal): number {
  const journey = goal.targetAmount - goal.openingBalance;
  if (journey <= 0) return 100;
  return Math.max(0, Math.min(100, ((expected - goal.openingBalance) / journey) * 100));
}
