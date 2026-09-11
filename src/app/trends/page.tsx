import Link from "next/link";
import { LineChart, RankedBars, type RankedBar } from "@/components/trends";
import { Empty, Heading, Money, Note } from "@/components/ui";
import {
  availableMonths,
  groupSeries,
  recurringMonthlyRate,
  trendSeries,
  type Txn,
} from "@/lib/aggregate";
import { describeCadence } from "@/lib/cadence";
import { listCategories, listGoals, listSavingsPlans, listTransactions } from "@/lib/db/queries";
import { goalProgress } from "@/lib/goals";
import { formatMonth, monthIndex } from "@/lib/months";
import { monthsToGoal } from "@/lib/savings";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const WINDOW_MONTHS = 24;
const GROUPS_SHOWN = 8;

export default async function Trends() {
  const { db, household } = await requireSession();
  const [rows, categoryList, goals, scenarios] = await Promise.all([
    listTransactions(db, household),
    listCategories(db, household),
    listGoals(db, household),
    listSavingsPlans(db, household),
  ]);

  const txns: Txn[] = rows;
  const categories = new Map(categoryList.map((c) => [c.id, c]));
  const all = availableMonths(txns);

  if (all.length === 0) {
    return (
      <>
        <Heading eyebrow="How it has been going" title="Trends" />
        <Empty title="No months to compare yet">
          A trend needs more than one month.{" "}
          <Link href="/add" className="underline">
            Import a statement
          </Link>{" "}
          and this fills in.
        </Empty>
      </>
    );
  }

  const months = [...all].reverse().slice(-WINDOW_MONTHS);
  const series = trendSeries(txns, categories, months);
  const latest = months[months.length - 1];

  const incomeVsSpending = [
    { name: "Income", colour: "var(--accent)", values: series.map((p) => p.income) },
    { name: "Spent", colour: "var(--spend)", values: series.map((p) => p.totalSpent) },
  ];

  // Cumulative net is re-based on the window, so it reads as "since March"
  // rather than as a number whose zero is off the left edge of the chart.
  const opening = series[0] ? series[0].cumulativeNet - series[0].saved : 0;
  const cumulative = [
    {
      name: "Kept, running total",
      colour: "var(--accent)",
      values: series.map((p) => Number((p.cumulativeNet - opening).toFixed(2))),
    },
  ];

  const byGroup = groupSeries(txns, categories, months);
  const groupTotals = new Map<string, number>();
  for (const point of byGroup) {
    for (const [key, value] of Object.entries(point)) {
      if (key === "month" || typeof value !== "number") continue;
      groupTotals.set(key, Number(((groupTotals.get(key) ?? 0) + value).toFixed(2)));
    }
  }

  const ranked = [...groupTotals.entries()]
    .map(([group, total]) => ({
      id: group,
      label: group,
      value: Number((total / months.length).toFixed(2)),
    }))
    .sort((a, b) => b.value - a.value);

  // A ninth colour is never invented; the tail folds into one row that says
  // what it is.
  const groupBars: RankedBar[] = ranked.slice(0, GROUPS_SHOWN);
  const tail = ranked.slice(GROUPS_SHOWN);
  if (tail.length > 0) {
    groupBars.push({
      id: "rest",
      label: `${tail.length} smaller groups`,
      value: Number(tail.reduce((sum, r) => sum + r.value, 0).toFixed(2)),
    });
  }

  // What each recurring category actually costs a month, aligned to whole
  // billing cycles so a window that misses a bimonthly bill does not halve it.
  const rates = categoryList
    .filter((c) => !c.archived && c.kind === "expense" && !c.oneOff)
    .map((c) => ({
      category: c,
      rate: recurringMonthlyRate(txns, c, categories, {
        asOfMonth: latest,
        windowMonths: 12,
        confirmedRate: c.confirmedMonthlyRate,
      }),
    }))
    .filter((r) => r.rate.rate > 0)
    .sort((a, b) => b.rate.rate - a.rate.rate);

  const recurringTotal = Number(rates.reduce((sum, r) => sum + r.rate.rate, 0).toFixed(2));
  const costBars: RankedBar[] = rates.slice(0, 12).map((r) => ({
    id: r.category.id,
    label: r.category.name,
    value: r.rate.rate,
    detail:
      r.rate.basis === "confirmed"
        ? "as entered"
        : r.rate.insufficientHistory
          ? "not enough history"
          : `${r.rate.monthsUsed}mo avg · ${describeCadence(r.category.cadence)}`,
  }));

  const cashGoal = goals.find((g) => g.kind === "cash");
  const active = scenarios.find((s) => s.active) ?? null;
  const recentMonths = series.slice(-6);
  const recentRate =
    recentMonths.length > 0
      ? Number((recentMonths.reduce((sum, p) => sum + p.saved, 0) / recentMonths.length).toFixed(2))
      : 0;

  const kept = series
    .filter((p) => !cashGoal || monthIndex(p.month) >= monthIndex(cashGoal.startMonth))
    .reduce((sum, p) => sum + p.saved, 0);
  const balance = cashGoal ? Number((cashGoal.openingBalance + kept).toFixed(2)) : 0;
  const progress = cashGoal ? goalProgress(cashGoal, balance, latest) : null;

  const atThisRate =
    cashGoal && recentRate > 0
      ? monthsToGoal({
          id: "actual",
          name: "At this rate",
          monthlyAmount: recentRate,
          annualRate: cashGoal.annualRate,
          startingBalance: balance,
          goalAmount: cashGoal.targetAmount,
          goalYears: Math.ceil(cashGoal.targetMonths / 12),
          active: false,
        })
      : null;

  return (
    <>
      <Heading
        eyebrow="How it has been going"
        title="Trends"
        lede={`The last ${months.length} month${months.length === 1 ? "" : "s"} of the ledger. One month is a mood; a line is a habit.`}
      />

      {months.length < 3 && (
        <div className="mb-8">
          <Note>
            Only {months.length} month{months.length === 1 ? "" : "s"} of history so far. Every
            average below is drawn from that, so read it as a first reading rather than a rate.
          </Note>
        </div>
      )}

      <LineChart
        caption="Income and spending, month by month"
        months={months}
        series={incomeVsSpending}
        note="The gap between the two lines is the month. When they touch, nothing was kept."
      />

      <LineChart
        caption={`Kept since ${formatMonth(months[0], { long: true })}`}
        months={months}
        series={cumulative}
        zeroLine
        note="A running total of what was left over each month. Falling means a month spent more than it earned, not that savings were withdrawn — this is the ledger, not a bank balance."
      />

      <RankedBars
        caption="Where the recurring money goes, a month at a time"
        rows={groupBars}
        shareOf="the month's recurring"
        note={`Averaged across ${months.length} month${months.length === 1 ? "" : "s"}, one-off costs excluded — those live on the one-off page, where they cannot skew an average.`}
      />

      {costBars.length > 0 && (
        <RankedBars
          caption="What each recurring cost actually runs at"
          rows={costBars}
          total={recurringTotal}
          shareOf="all recurring"
          note="Averaged over whole billing cycles, so a category that bills every two months is not halved by a twelve-month window that happens to catch five bills instead of six. Hover a row for how the figure was worked out."
        />
      )}

      <section className="mt-10">
        <p className="eyebrow mb-2">Cash projection</p>
        {!cashGoal ? (
          <Note>
            No savings goal set, so there is nothing to project towards.{" "}
            <Link href="/goals" className="underline">
              Set one
            </Link>
            .
          </Note>
        ) : (
          <div className="border-rule bg-sunk rounded-lg border p-4">
            <p className="text-2xl font-semibold tracking-tight">
              <Money amount={balance} />
              <span className="text-muted text-sm font-normal">
                {" "}
                of <Money amount={cashGoal.targetAmount} />
              </span>
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <Line
                label="Kept a month, last 6 months"
                value={<Money amount={recentRate} tone />}
              />
              {active && (
                <Line
                  label={`The plan (${active.name})`}
                  value={<Money amount={active.monthlyAmount} />}
                />
              )}
              {progress && (
                <Line
                  label="Needed a month from here"
                  value={<Money amount={progress.requiredMonthly} />}
                />
              )}
            </dl>
            <p className="text-muted mt-3 max-w-prose text-sm">
              {recentRate <= 0 ? (
                <>
                  Nothing has been kept on average over the last {recentMonths.length} months, so
                  there is no rate to project forward. The target date is not reachable from here
                  without a change.
                </>
              ) : atThisRate === null ? (
                <>
                  At <Money amount={recentRate} /> a month it does not reach{" "}
                  <Money amount={cashGoal.targetAmount} /> inside a hundred years. That is the
                  arithmetic saying the goal and the rate disagree, not a bug.
                </>
              ) : (
                <>
                  At <Money amount={recentRate} /> a month it lands in {atThisRate} more month
                  {atThisRate === 1 ? "" : "s"} —{" "}
                  {progress && atThisRate <= progress.monthsRemaining
                    ? `inside the ${progress.monthsRemaining} left.`
                    : progress
                      ? `${atThisRate - progress.monthsRemaining} month${atThisRate - progress.monthsRemaining === 1 ? "" : "s"} later than the deadline.`
                      : "."}
                </>
              )}
            </p>
            <p className="text-faint mt-2 max-w-prose text-xs">
              Worked out from the ledger and the goal&apos;s opening balance, not from a bank
              statement. The account itself is the authority —{" "}
              <Link href="/assets" className="underline">
                enter its balance
              </Link>{" "}
              and the two can be compared.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-rule flex items-baseline justify-between gap-4 border-b pb-2">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 font-medium">{value}</dd>
    </div>
  );
}
