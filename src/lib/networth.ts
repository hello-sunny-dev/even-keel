import { monthIndex } from "./months";
import { negated, sumAmounts } from "./money";

export type AccountKind = "cash" | "investment" | "super" | "property" | "loan";

/**
 * Where the money is, in terms of what could actually be done with it.
 *
 * `available` is reachable today, `invested` is reachable but at market risk,
 * `locked` is superannuation and home equity — real wealth that cannot pay a
 * bill this month. Net worth alone hides that distinction, and it is the one
 * that decides whether a household is comfortable or merely wealthy on paper.
 */
export type Bucket = "available" | "invested" | "locked";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  bucket: Bucket;
  currency: string;
  archived: boolean;
};

export type Balance = {
  accountId: string;
  month: string;
  /** A loan holds the amount owed, positive. */
  amount: number;
  /** Of that balance, how much was paid in during the month. */
  contributed: number;
};

/** A loan is owed, not owned. Everything else counts as it stands. */
export function signedFor(kind: AccountKind, amount: number): number {
  return kind === "loan" ? negated(amount) : amount;
}

export type NetWorthPoint = {
  month: string;
  available: number;
  invested: number;
  locked: number;
  owed: number;
  netWorth: number;
  /** True when at least one account's figure was carried from an earlier month. */
  estimated: boolean;
  /** Which accounts were carried, so the screen can say which figure is stale. */
  carried: string[];
  /**
   * How many accounts had a figure to contribute.
   *
   * Zero is not the same as a net worth of zero: reading a month from before
   * the household started entering balances, every total is zero because
   * nothing was recorded, and a screen that shows "$0 — Behind" for it is
   * making a claim about wealth from an absence of data.
   */
  counted: number;
};

/**
 * The last balance entered at or before a month.
 *
 * A month with no entry is not an account worth nothing — it is a month nobody
 * typed a number in. Carrying the last one forward keeps the total honest;
 * marking it carried keeps the total from being read as fresh.
 */
function latestAtOrBefore(balances: Balance[], month: string): Balance | null {
  let best: Balance | null = null;
  for (const b of balances) {
    if (monthIndex(b.month) > monthIndex(month)) continue;
    if (!best || monthIndex(b.month) > monthIndex(best.month)) best = b;
  }
  return best;
}

export function netWorthAt(accounts: Account[], balances: Balance[], month: string): NetWorthPoint {
  const point: NetWorthPoint = {
    month,
    available: 0,
    invested: 0,
    locked: 0,
    owed: 0,
    netWorth: 0,
    estimated: false,
    carried: [],
    counted: 0,
  };

  for (const account of accounts) {
    if (account.archived) continue;
    const mine = balances.filter((b) => b.accountId === account.id);
    const balance = latestAtOrBefore(mine, month);
    if (!balance) continue;

    point.counted += 1;
    if (balance.month !== month) {
      point.estimated = true;
      point.carried.push(account.id);
    }

    if (account.kind === "loan") {
      point.owed = round2(point.owed + balance.amount);
    } else {
      point[account.bucket] = round2(point[account.bucket] + balance.amount);
    }
  }

  point.netWorth = round2(point.available + point.invested + point.locked - point.owed);
  return point;
}

export function netWorthSeries(
  accounts: Account[],
  balances: Balance[],
  months: string[],
): NetWorthPoint[] {
  return months.map((month) => netWorthAt(accounts, balances, month));
}

export type AccountMovement = {
  accountId: string;
  from: string;
  to: string;
  opening: number;
  closing: number;
  contributed: number;
  /**
   * What the account earned or lost on its own, once contributions are taken
   * out. Null when there is only one real snapshot to work from — with nothing
   * to compare against, any figure here would be invented.
   */
  gain: number | null;
};

/**
 * What an account did between its own two most recent real snapshots.
 *
 * Deliberately not month to month. Skip July and a naive difference turns
 * August into a two-month jump: the $500 put in during July shows up as a $500
 * gain in August and a $500 loss in July, neither of which happened. So the
 * span is between snapshots that exist, and every contribution inside the span
 * is subtracted before anything is called growth.
 */
export function movementFor(
  account: Account,
  balances: Balance[],
  asOf: string,
): AccountMovement | null {
  const mine = balances
    .filter((b) => b.accountId === account.id && monthIndex(b.month) <= monthIndex(asOf))
    .sort((a, b) => monthIndex(a.month) - monthIndex(b.month));

  if (mine.length === 0) return null;
  const closing = mine[mine.length - 1];

  if (mine.length === 1) {
    return {
      accountId: account.id,
      from: closing.month,
      to: closing.month,
      opening: closing.amount,
      closing: closing.amount,
      contributed: closing.contributed,
      gain: null,
    };
  }

  const opening = mine[mine.length - 2];
  // Contributions belonging to the span are the ones made after the opening
  // snapshot was taken, up to and including the closing month.
  const contributed = sumAmounts(
    mine
      .filter(
        (b) =>
          monthIndex(b.month) > monthIndex(opening.month) &&
          monthIndex(b.month) <= monthIndex(closing.month),
      )
      .map((b) => b.contributed),
  );

  const change = closing.amount - opening.amount;
  // What this account did to net worth, with money moved in or out taken back
  // out of it. An asset grows: closing = opening + contributed + gain. A loan
  // shrinks as it is repaid and grows by interest, and `contributed` on one is
  // the amount repaid: closing = opening − repaid + interest. Interest costs
  // net worth, so it is reported negative.
  const gain = account.kind === "loan" ? negated(change + contributed) : change - contributed;

  return {
    accountId: account.id,
    from: opening.month,
    to: closing.month,
    opening: opening.amount,
    closing: closing.amount,
    contributed,
    gain: round2(gain),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
