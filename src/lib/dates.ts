/**
 * Dates in this app are plain `YYYY-MM-DD` strings, never `Date` objects.
 *
 * A `Date` carries an instant, not a day. Formatting one with `toISOString()`
 * shifts the day backwards anywhere east of UTC — a Perth or Seoul evening
 * becomes the previous date — and `getUTCMonth()` puts the first week of a
 * month in the wrong month for the same reason. Both bugs are silent: the
 * figures still add up, they are just filed under the wrong day.
 *
 * So the boundary rule is: SQL casts dates with `::text`, JSON carries
 * strings, and the only place a timezone is consulted is when working out
 * what "today" means for a particular person.
 */

export type IsoDate = string; // YYYY-MM-DD
export type IsoMonth = string; // YYYY-MM

/** en-CA formats as YYYY-MM-DD, which is the whole reason it is used here. */
function partsIn(timeZone: string, at: Date): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Today where the person is, not where the server is. */
export function todayIn(timeZone: string, at: Date = new Date()): IsoDate {
  return partsIn(timeZone, at);
}

export function currentMonthIn(timeZone: string, at: Date = new Date()): IsoMonth {
  return todayIn(timeZone, at).slice(0, 7);
}

/** The viewer's own zone. Client-side only — the server has no business guessing. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/**
 * Format a `Date` that a driver produced for a `date` column.
 *
 * Postgres date columns have no time and no zone; drivers materialise them at
 * *local* midnight, so reading the local components gives the day back
 * unchanged while `toISOString()` would move it. Prefer casting to text in SQL
 * so this is never needed; it exists for values that arrive as `Date` anyway.
 */
export function dateFromDriver(value: unknown): IsoDate {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}
