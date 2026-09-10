/** `YYYY-MM` helpers. Everything month-shaped in the app uses this format. */

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function monthIndex(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return y * 12 + (m - 1);
}

export function fromMonthIndex(index: number): string {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function addMonths(month: string, n: number): string {
  return fromMonthIndex(monthIndex(month) + n);
}

/** Inclusive count: Jan→Jan is 1, Jan→Feb is 2. */
export function monthSpan(from: string, to: string): number {
  return monthIndex(to) - monthIndex(from) + 1;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let i = monthIndex(from); i <= monthIndex(to); i++) out.push(fromMonthIndex(i));
  return out;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatMonth(month: string, opts?: { long?: boolean }): string {
  const [y, m] = month.split("-").map(Number);
  const name = MONTH_NAMES[m - 1] ?? month;
  return opts?.long ? `${name} ${y}` : `${name} ${String(y).slice(2)}`;
}

/**
 * The current month depends on where the person is standing. Pass their zone
 * — `currentMonthIn` in `dates.ts` is the implementation; this re-export keeps
 * month helpers in one place.
 */
export { currentMonthIn as currentMonth } from "./dates";
