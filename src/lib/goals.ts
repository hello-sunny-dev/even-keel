import { monthIndex } from "./months";
import { futureValue, requiredMonthlyForGoal } from "./savings";

export type GoalKind = "cash" | "net_worth";

export type Goal = {
  id: string;
  kind: GoalKind;
  name: string;
  targetAmount: number;
  targetMonths: number;
  /** Where the goal started, so progress is measured from a fact. */
  openingBalance: number;
  /** Nominal annual rate on the balance. Zero is a perfectly good answer. */
  annualRate: number;
  startMonth: string;
};

export type SavingsScenario = {
  id: string;
  name: string;
  monthlyAmount: number;
  note: string | null;
  active: boolean;
};

export type GoalProgress = {
  goal: Goal;
  /** Where the household actually is. */
  balance: number;
  /** Where a level contribution that lands exactly on target would have it by now. */
  expected: number;
  monthsElapsed: number;
  monthsRemaining: number;
  /** Of the whole journey — opening to target — not of the target itself. */
  percent: number;
  /** Ahead of the expected line, or behind it when negative. */
  ahead: number;
  onTrack: boolean;
  /** The level contribution that still lands on target from where we are. */
  requiredMonthly: number;
  /** The contribution the goal was set expecting. */
  plannedMonthly: number;
  reached: boolean;
};

/**
 * How a goal is going, as of a month.
 *
 * "Expected by now" is the balance a level contribution would have reached —
 * the same contribution the goal implies, compounded at the goal's own rate —
 * not a straight line between opening and target. With a rate of zero the two
 * are the same thing, which is why a straight line is so easy to leave in and
 * so wrong once a rate is set.
 */
export function goalProgress(goal: Goal, balance: number, asOfMonth: string): GoalProgress {
  const elapsed = Math.max(0, monthIndex(asOfMonth) - monthIndex(goal.startMonth) + 1);
  const monthsElapsed = Math.min(elapsed, goal.targetMonths);
  const monthsRemaining = Math.max(0, goal.targetMonths - monthsElapsed);

  const plannedMonthly = requiredMonthlyForGoal(
    goal.targetAmount,
    goal.targetMonths,
    goal.annualRate,
    goal.openingBalance,
  );
  const expected = round2(
    futureValue(
      {
        monthlyAmount: plannedMonthly,
        annualRate: goal.annualRate,
        startingBalance: goal.openingBalance,
      },
      monthsElapsed,
    ),
  );

  const journey = goal.targetAmount - goal.openingBalance;
  const travelled = balance - goal.openingBalance;

  return {
    goal,
    balance: round2(balance),
    expected,
    monthsElapsed,
    monthsRemaining,
    // A goal whose target equals its opening balance is already met; dividing
    // by that journey would say NaN.
    percent: journey === 0 ? 100 : clamp(round2((travelled / journey) * 100)),
    ahead: round2(balance - expected),
    onTrack: balance >= expected,
    requiredMonthly: requiredMonthlyForGoal(
      goal.targetAmount,
      monthsRemaining,
      goal.annualRate,
      balance,
    ),
    plannedMonthly,
    reached: balance >= goal.targetAmount,
  };
}

export type ScenarioScore = {
  scenario: SavingsScenario;
  required: number;
  actual: number;
  vsPlan: number;
  passed: boolean;
};

/**
 * Every scenario scored against the same month.
 *
 * Scoring only the active one answers "did we hit the number we chose?" — but
 * the question worth asking is which numbers this month could have carried. A
 * month that clears Minimum and misses Aggressive says something a single
 * pass/fail cannot.
 */
export function scoreScenarios(actualSaved: number, scenarios: SavingsScenario[]): ScenarioScore[] {
  return [...scenarios]
    .sort((a, b) => a.monthlyAmount - b.monthlyAmount)
    .map((scenario) => ({
      scenario,
      required: scenario.monthlyAmount,
      actual: round2(actualSaved),
      vsPlan: round2(actualSaved - scenario.monthlyAmount),
      passed: actualSaved >= scenario.monthlyAmount,
    }));
}

/**
 * The ladder a household starts with when it has none.
 *
 * Anchored to what the goal actually requires rather than to round numbers, so
 * Minimum is the contribution that lands on target and the other two are what
 * getting there sooner costs. All three are editable; these are a starting
 * point, not a recommendation.
 */
export function suggestScenarios(goal: Goal): { name: string; monthlyAmount: number }[] {
  const base = requiredMonthlyForGoal(
    goal.targetAmount,
    goal.targetMonths,
    goal.annualRate,
    goal.openingBalance,
  );
  return [
    { name: "Minimum", monthlyAmount: round2(base) },
    { name: "Moderate", monthlyAmount: round2(base * 1.25) },
    { name: "Aggressive", monthlyAmount: round2(base * 1.5) },
  ];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(percent: number): number {
  return Math.max(0, Math.min(100, percent));
}
