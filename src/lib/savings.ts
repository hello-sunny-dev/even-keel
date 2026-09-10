export type SavingsPlan = {
  id: string;
  name: string;
  /** What this scenario commits to putting away each month. */
  monthlyAmount: number;
  /** Nominal annual rate, e.g. 0.045. Compounded monthly. */
  annualRate: number;
  startingBalance: number;
  goalAmount: number;
  goalYears: number;
  active: boolean;
};

export type ProjectionPoint = {
  monthIndex: number;
  month?: string;
  balance: number;
  contributed: number;
  interest: number;
};

function monthlyRate(annualRate: number): number {
  return annualRate / 12;
}

/** Future value of a starting balance plus a level monthly contribution. */
export function futureValue(
  plan: Pick<SavingsPlan, "monthlyAmount" | "annualRate" | "startingBalance">,
  months: number,
): number {
  const r = monthlyRate(plan.annualRate);
  if (months <= 0) return plan.startingBalance;
  if (r === 0) return plan.startingBalance + plan.monthlyAmount * months;
  const growth = Math.pow(1 + r, months);
  return plan.startingBalance * growth + plan.monthlyAmount * ((growth - 1) / r);
}

export function projectSeries(
  plan: Pick<SavingsPlan, "monthlyAmount" | "annualRate" | "startingBalance">,
  months: number,
  startMonth?: string,
): ProjectionPoint[] {
  const r = monthlyRate(plan.annualRate);
  const points: ProjectionPoint[] = [];
  let balance = plan.startingBalance;
  let contributed = plan.startingBalance;

  for (let i = 0; i <= months; i++) {
    if (i > 0) {
      balance = balance * (1 + r) + plan.monthlyAmount;
      contributed += plan.monthlyAmount;
    }
    points.push({
      monthIndex: i,
      month: startMonth ? addMonthsLocal(startMonth, i) : undefined,
      balance: round2(balance),
      contributed: round2(contributed),
      interest: round2(balance - contributed),
    });
  }
  return points;
}

/** Months until the plan reaches its goal, or null if it never does. */
export function monthsToGoal(plan: SavingsPlan, maxMonths = 1200): number | null {
  if (plan.startingBalance >= plan.goalAmount) return 0;
  const r = monthlyRate(plan.annualRate);
  let balance = plan.startingBalance;
  for (let i = 1; i <= maxMonths; i++) {
    balance = balance * (1 + r) + plan.monthlyAmount;
    if (balance >= plan.goalAmount) return i;
  }
  return null;
}

/** The level monthly contribution that lands exactly on the goal. */
export function requiredMonthlyForGoal(
  goalAmount: number,
  months: number,
  annualRate: number,
  startingBalance = 0,
): number {
  if (months <= 0) return Math.max(0, goalAmount - startingBalance);
  const r = monthlyRate(annualRate);
  const growth = Math.pow(1 + r, months);
  const shortfall = goalAmount - startingBalance * growth;
  if (shortfall <= 0) return 0;
  if (r === 0) return round2(shortfall / months);
  return round2((shortfall * r) / (growth - 1));
}

/**
 * The trajectory as it actually is: real saved amounts month by month up to
 * today, then the active plan's contribution from there on.
 */
export function projectFromActuals(
  actualsByMonth: { month: string; saved: number }[],
  plan: Pick<SavingsPlan, "monthlyAmount" | "annualRate" | "startingBalance">,
  horizonMonths: number,
): ProjectionPoint[] {
  const r = monthlyRate(plan.annualRate);
  const sorted = [...actualsByMonth].sort((a, b) => a.month.localeCompare(b.month));
  const points: ProjectionPoint[] = [];
  let balance = plan.startingBalance;
  let contributed = plan.startingBalance;
  let i = 0;

  for (const { month, saved } of sorted) {
    balance = balance * (1 + r) + saved;
    contributed += saved;
    i += 1;
    points.push({
      monthIndex: i,
      month,
      balance: round2(balance),
      contributed: round2(contributed),
      interest: round2(balance - contributed),
    });
  }

  const last = sorted[sorted.length - 1]?.month;
  for (let k = 1; i < horizonMonths; k++) {
    balance = balance * (1 + r) + plan.monthlyAmount;
    contributed += plan.monthlyAmount;
    i += 1;
    points.push({
      monthIndex: i,
      month: last ? addMonthsLocal(last, k) : undefined,
      balance: round2(balance),
      contributed: round2(contributed),
      interest: round2(balance - contributed),
    });
  }
  return points;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addMonthsLocal(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
