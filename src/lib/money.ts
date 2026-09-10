const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const AUD_CENTS = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `$#,##0`, negatives with a leading minus — never parentheses. */
export function formatAUD(amount: number, opts?: { cents?: boolean }): string {
  const fmt = opts?.cents ? AUD_CENTS : AUD;
  const rounded = opts?.cents ? amount : Math.round(amount);
  if (Object.is(rounded, -0) || rounded === 0) return fmt.format(0);
  return rounded < 0 ? `-${fmt.format(Math.abs(rounded))}` : fmt.format(rounded);
}

export function formatSigned(amount: number): string {
  const s = formatAUD(amount);
  return amount > 0 ? `+${s}` : s;
}

/** Round to cents without the usual binary-float drift. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function sumAmounts(amounts: number[]): number {
  return fromCents(amounts.reduce((acc, a) => acc + toCents(a), 0));
}

/**
 * Flip the sign of a total, without producing negative zero.
 *
 * Spending is summed as it is stored — negative — and reported positive, so
 * every one of those totals is a negation. An empty month would otherwise
 * carry `-0` into comparisons and into anything that reads the sign.
 */
export function negated(amount: number): number {
  return amount === 0 ? 0 : -amount;
}
