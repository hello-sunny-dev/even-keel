import { Empty, Heading, Money, Note } from "@/components/ui";
import { currentMonthIn } from "@/lib/dates";
import { listAccounts, listBalances, listGoals } from "@/lib/db/queries";
import { goalProgress } from "@/lib/goals";
import { movementFor, netWorthAt } from "@/lib/networth";
import { formatMonth } from "@/lib/months";
import { requireSession } from "@/lib/session";
import { GoalBar, Verdict } from "@/components/charts";
import { AccountRow, AddAccount } from "./AssetsClient";

export const dynamic = "force-dynamic";

export default async function Assets({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { db, household, settings } = await requireSession();
  const [accounts, balances, goals] = await Promise.all([
    listAccounts(db, household),
    listBalances(db, household),
    listGoals(db, household),
  ]);

  const thisMonth = currentMonthIn(settings.timeZone);
  const requested = (await searchParams).month;
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : thisMonth;

  const live = accounts.filter((a) => !a.archived);
  const point = netWorthAt(accounts, balances, month);
  const netWorthGoal = goals.find((g) => g.kind === "net_worth");
  const progress =
    netWorthGoal && point.counted > 0 ? goalProgress(netWorthGoal, point.netWorth, month) : null;

  return (
    <>
      <Heading
        eyebrow="Everything owned, less everything owed"
        title="Net worth"
        lede="One number per account per month, typed in by hand. Nothing here is imported, because no statement knows what a house is worth."
      />

      {live.length === 0 ? (
        <>
          <Empty title="No accounts yet">
            Net worth needs the things a bank statement never mentions: superannuation, the house,
            the mortgage. Add them below — a name and what kind of thing it is.
          </Empty>
          <div className="mt-6">
            <AddAccount />
          </div>
        </>
      ) : (
        <>
          <section className="border-rule bg-sunk mb-8 rounded-lg border p-4">
            <p className="eyebrow flex items-baseline justify-between">
              <span>{formatMonth(month, { long: true })}</span>
              {progress && (
                <Verdict good={progress.onTrack}>
                  {progress.reached ? "Reached" : progress.onTrack ? "On track" : "Behind"}
                </Verdict>
              )}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">
              <Money amount={point.netWorth} />
              {netWorthGoal && (
                <span className="text-muted text-sm font-normal">
                  {" "}
                  of <Money amount={netWorthGoal.targetAmount} />
                </span>
              )}
            </p>

            {progress && netWorthGoal && (
              <>
                <GoalBar
                  percent={progress.percent}
                  expectedPercent={expectedPercent(
                    progress.expected,
                    netWorthGoal.openingBalance,
                    netWorthGoal.targetAmount,
                  )}
                  onTrack={progress.onTrack}
                />
                <p className="text-muted text-xs">
                  The mark is <Money amount={progress.expected} /> — where{" "}
                  {formatMonth(month, { long: true })} should have reached.
                </p>
              </>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Bucket label="Available" hint="spendable today" amount={point.available} />
              <Bucket label="Invested" hint="reachable, at risk" amount={point.invested} />
              <Bucket label="Locked" hint="super and property" amount={point.locked} />
              <Bucket label="Owed" hint="loans" amount={-point.owed} />
            </dl>

            {point.estimated && (
              <div className="mt-4">
                <Note tone="warn">
                  {point.carried.length} of {live.length} accounts have no figure for this month, so
                  the last one entered is being carried forward. The total is a best guess until
                  they are filled in.
                </Note>
              </div>
            )}
          </section>

          <p className="eyebrow mb-1">Accounts</p>
          <ul className="border-rule-strong mb-8 border-t">
            {live.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                latest={
                  balances
                    .filter((b) => b.accountId === account.id && b.month <= month)
                    .sort((a, b) => a.month.localeCompare(b.month))
                    .at(-1) ?? null
                }
                movement={movementFor(account, balances, month)}
                month={month}
              />
            ))}
          </ul>

          <p className="eyebrow mb-3">Add another</p>
          <AddAccount />
        </>
      )}
    </>
  );
}

function Bucket({ label, hint, amount }: { label: string; hint: string; amount: number }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="m-0 text-lg font-semibold">
        <Money amount={amount} />
      </dd>
      <p className="text-faint text-xs">{hint}</p>
    </div>
  );
}

function expectedPercent(expected: number, opening: number, target: number): number {
  const journey = target - opening;
  if (journey <= 0) return 100;
  return Math.max(0, Math.min(100, ((expected - opening) / journey) * 100));
}
