/**
 * How often a thing bills.
 *
 * Whole months cannot express a fortnight, and Australian pay usually is one.
 * Storing a unit alongside a count keeps every rhythm this household actually
 * has: fortnightly income, bimonthly utilities, annual rates.
 */

export type CadenceUnit = "day" | "week" | "month";

export type Cadence = {
  unit: CadenceUnit;
  count: number;
};

export const MONTHLY: Cadence = { unit: "month", count: 1 };
export const FORTNIGHTLY: Cadence = { unit: "week", count: 2 };

const DAYS_PER_YEAR = 365.25;

/** How many times a cadence comes round in an average month. */
export function cyclesPerMonth(cadence: Cadence): number {
  const count = Math.max(1, cadence.count);
  switch (cadence.unit) {
    case "day":
      return DAYS_PER_YEAR / count / 12;
    case "week":
      return DAYS_PER_YEAR / (7 * count) / 12;
    case "month":
      return 1 / count;
  }
}

/**
 * A fortnightly $650 is not $1,300 a month. There are 365.25 / 14 ≈ 26.09
 * fortnights in an average year, so it is about $1,413 — and the extra .09 is
 * the reason some years carry 27 pays instead of 26. Treating it as twice
 * monthly understates a car loan by a month's worth every year.
 */
export function toMonthlyRate(amountPerCycle: number, cadence: Cadence): number {
  return Number((amountPerCycle * cyclesPerMonth(cadence)).toFixed(2));
}

export function cadenceInDays(cadence: Cadence): number {
  const count = Math.max(1, cadence.count);
  switch (cadence.unit) {
    case "day":
      return count;
    case "week":
      return 7 * count;
    case "month":
      return (DAYS_PER_YEAR / 12) * count;
  }
}

export function describeCadence(cadence: Cadence): string {
  const { unit, count } = cadence;
  if (unit === "week" && count === 2) return "fortnightly";
  if (unit === "week" && count === 1) return "weekly";
  if (unit === "month" && count === 1) return "monthly";
  if (unit === "month" && count === 3) return "quarterly";
  if (unit === "month" && count === 12) return "annually";
  return `every ${count} ${unit}s`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

const CANDIDATES: { cadence: Cadence; days: number }[] = [
  { cadence: { unit: "week", count: 1 }, days: 7 },
  { cadence: { unit: "week", count: 2 }, days: 14 },
  { cadence: { unit: "month", count: 1 }, days: 30.44 },
  { cadence: { unit: "month", count: 2 }, days: 60.88 },
  { cadence: { unit: "month", count: 3 }, days: 91.31 },
  { cadence: { unit: "month", count: 6 }, days: 182.63 },
  { cadence: { unit: "month", count: 12 }, days: 365.25 },
];

/**
 * Work out a rhythm from when the charges actually landed, so the user does
 * not have to declare one. The median gap resists a single missed or doubled
 * bill in a way the mean does not.
 *
 * Needs at least three dates: two give one interval, and one interval is a
 * coincidence rather than a rhythm.
 */
export function detectCadence(dates: string[]): Cadence | null {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length < 3) return null;

  const gaps = sorted.slice(1).map((d, i) => daysBetween(sorted[i], d));
  const middle = [...gaps].sort((a, b) => a - b);
  const median =
    middle.length % 2
      ? middle[(middle.length - 1) / 2]
      : (middle[middle.length / 2 - 1] + middle[middle.length / 2]) / 2;

  // A rhythm means the intervals agree with each other. Without this, two
  // gaps of 14 and 134 days average out to something near a quarter and get
  // confidently named "quarterly", which is worse than admitting ignorance.
  const consistent = gaps.filter((gap) => Math.abs(gap - median) <= median * 0.3).length;
  if (consistent / gaps.length < 0.6) return null;

  let best: { cadence: Cadence; error: number } | null = null;
  for (const { cadence, days } of CANDIDATES) {
    const error = Math.abs(median - days) / days;
    if (!best || error < best.error) best = { cadence, error };
  }
  return best && best.error <= 0.25 ? best.cadence : null;
}

/**
 * How many cycles land inside a month.
 *
 * Fortnightly pay gives two most months and three twice a year. That third
 * pay makes the month clear every savings scenario for reasons that have
 * nothing to do with spending, so the dashboard has to be able to say so.
 */
export function cyclesInMonth(cadence: Cadence, month: string, anchor: string): number {
  if (cadence.unit === "month") {
    // A monthly-ish cadence lands at most once in a month, and every Nth month.
    const [ay, am] = anchor.split("-").map(Number);
    const [my, mm] = month.split("-").map(Number);
    const offset = (my * 12 + mm - 1 - (ay * 12 + am - 1)) % Math.max(1, cadence.count);
    return offset === 0 ? 1 : 0;
  }

  const step = cadenceInDays(cadence);
  const [y, m] = month.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1);
  const [ay, am, ad] = anchor.split("-").map(Number);

  let at = Date.UTC(ay, am - 1, ad);
  const stepMs = step * 86_400_000;
  while (at >= end) at -= stepMs;
  while (at < start) at += stepMs;

  let count = 0;
  for (; at < end; at += stepMs) count += 1;
  return count;
}
