import Link from "next/link";
import { GoalBar, MonthStrip, Verdict, type MonthBar } from "@/components/charts";
import { Empty, Heading, Money, Note } from "@/components/ui";
import {
  availableMonths,
  categoryBreakdown,
  monthlySummary,
  movedOut,
  trendSeries,
  type Txn,
} from "@/lib/aggregate";
import { currentMonthIn } from "@/lib/dates";
import {
  listAccounts,
  listBalances,
  listCategories,
  listGoals,
  listSavingsPlans,
  listTransactions,
} from "@/lib/db/queries";
import { goalProgress, scoreScenarios, type Goal } from "@/lib/goals";
import { addMonths, formatMonth, monthIndex, monthRange } from "@/lib/months";
import { netWorthAt } from "@/lib/networth";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const STRIP_MONTHS = 12;

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { db, household: id, settings } = await requireSession();
  const [rows, categoryList, goals, scenarios, accounts, balances] = await Promise.all([
    listTransactions(db, id),
    listCategories(db, id),
    listGoals(db, id),
    listSavingsPlans(db, id),
    listAccounts(db, id),
    listBalances(db, id),
  ]);

  const txns: Txn[] = rows;
  const categories = new Map(categoryList.map((c) => [c.id, c]));
  const ledgerMonths = availableMonths(txns);
  // Selectable months are every month anything was recorded in, not only the
  // ones with transactions. A month with a balance and no statement is still a
  // month worth reading — that is the whole point of tracking net worth
  // separately from cash.
  const months = [...new Set([...ledgerMonths, ...balances.map((b) => b.month)])].sort((a, b) =>
    b.localeCompare(a),
  );
  const requested = (await searchParams).month;
  const thisMonth = currentMonthIn(settings.timeZone);
  // A household can track net worth without importing anything, so the page
  // falls back to the current month rather than to nothing at all when there
  // are no transactions but there are balances.
  const month = requested && months.includes(requested) ? requested : (months[0] ?? thisMonth);
  const hasLedger = ledgerMonths.length > 0;

  const cashGoal = goals.find((g) => g.kind === "cash");
  const netWorthGoal = goals.find((g) => g.kind === "net_worth");
  const active = scenarios.find((s) => s.active) ?? null;

  const hasAccounts = accounts.some((a) => !a.archived);

  if (months.length === 0 && !hasAccounts) {
    return (
      <FirstRun
        hasGoal={Boolean(cashGoal)}
        hasScenarios={scenarios.length > 0}
        hasAccounts={hasAccounts}
      />
    );
  }

  const worth = accounts.some((a) => !a.archived) ? netWorthAt(accounts, balances, month) : null;
  // Only scored when there is something to score: a month before the first
  // balance was entered has no net worth, rather than a net worth of nothing.
  const netWorthProgress =
    netWorthGoal && worth && worth.counted > 0
      ? goalProgress(netWorthGoal, worth.netWorth, month)
      : null;

  const summary = monthlySummary(txns, month, categories, active);
  const targets = new Map(
    categoryList.filter((c) => c.targetMonthly !== null).map((c) => [c.id, c.targetMonthly!]),
  );
  const breakdown = categoryBreakdown(txns, month, categories, targets);
  const invested = movedOut(txns, month, categories);
  const ladder = scoreScenarios(summary.actualSaved, scenarios);

  // The strip is a timeline, not a view of the selection: it ends at the most
  // recent month there is data for, so a bar can always be clicked in either
  // direction. Anchoring it to the month being read instead would mean that
  // opening March left no way back to April except the dropdown — the chart
  // has to be the navigation, or it is decoration with a click handler.
  //
  // It does not begin before the ledger does. A bar for a month with no
  // transactions is not a month that saved nothing, and a row of them in red
  // says the household failed at a time it was not yet keeping figures.
  const earliest = ledgerMonths[ledgerMonths.length - 1] ?? month;
  const latest = ledgerMonths[0] ?? month;
  const stripEnd = monthIndex(month) > monthIndex(latest) ? month : latest;
  const window = addMonths(stripEnd, -(STRIP_MONTHS - 1));
  const stripStart = monthIndex(window) > monthIndex(earliest) ? window : earliest;
  const strip: MonthBar[] = monthRange(stripStart, stripEnd).map((m) => ({
    month: m,
    saved: monthlySummary(txns, m, categories, null).actualSaved,
    required: active?.monthlyAmount ?? 0,
  }));

  // Cash on hand, as far as the ledger can tell. Once accounts and balance
  // snapshots land they become the authority and this becomes the check
  // against them — a statement knows about money this app never saw.
  const cashProgress = cashGoal ? progressFromLedger(cashGoal, txns, categories, month) : null;

  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const year = month.slice(0, 4);

  return (
    <>
      <Heading eyebrow="Are we on track?" title={formatMonth(month, { long: true })} />

      {hasLedger && (
        <form className="mb-6 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="month">
            Month
          </label>
          <select
            id="month"
            name="month"
            defaultValue={month}
            className="border-rule-strong bg-sheet rounded-lg border px-3 py-2 text-sm"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m, { long: true })}
              </option>
            ))}
          </select>
          <button type="submit" className="border-rule-strong rounded-lg border px-3 py-2 text-sm">
            Show
          </button>
          {years.length > 1 && (
            <span className="text-faint self-center text-xs">
              {years.length} years of history · showing {year}
            </span>
          )}
        </form>
      )}

      {(cashProgress || netWorthGoal) && (
        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          {cashProgress && (
            <div className="border-rule bg-sunk rounded-lg border p-4">
              <p className="eyebrow flex items-baseline justify-between">
                <span>{cashProgress.goal.name}</span>
                <Verdict good={cashProgress.onTrack}>
                  {cashProgress.reached ? "Reached" : cashProgress.onTrack ? "On track" : "Behind"}
                </Verdict>
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                <Money amount={cashProgress.balance} />
                <span className="text-muted text-sm font-normal">
                  {" "}
                  of <Money amount={cashProgress.goal.targetAmount} />
                </span>
              </p>
              <GoalBar
                percent={cashProgress.percent}
                expectedPercent={expectedPercent(cashProgress.expected, cashProgress.goal)}
                onTrack={cashProgress.onTrack}
              />
              <p className="text-muted text-xs">
                The mark is where {formatMonth(month, { long: true })} should have reached:{" "}
                <Money amount={cashProgress.expected} />.{" "}
                {cashProgress.reached ? (
                  "Done."
                ) : (
                  <>
                    <Money amount={cashProgress.requiredMonthly} /> a month for the remaining{" "}
                    {cashProgress.monthsRemaining} gets there.
                  </>
                )}
              </p>
              <p className="text-faint mt-2 text-xs">
                Worked out from the ledger, not from a bank balance — money this app has never seen
                is not in it.
              </p>
            </div>
          )}

          {netWorthGoal && (
            <div className="border-rule bg-sunk rounded-lg border p-4">
              <p className="eyebrow flex items-baseline justify-between">
                <span>{netWorthGoal.name}</span>
                {netWorthProgress && (
                  <Verdict good={netWorthProgress.onTrack}>
                    {netWorthProgress.reached
                      ? "Reached"
                      : netWorthProgress.onTrack
                        ? "On track"
                        : "Behind"}
                  </Verdict>
                )}
              </p>

              {netWorthProgress && worth ? (
                <>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    <Money amount={worth.netWorth} />
                    <span className="text-muted text-sm font-normal">
                      {" "}
                      of <Money amount={netWorthGoal.targetAmount} />
                    </span>
                  </p>
                  <GoalBar
                    percent={netWorthProgress.percent}
                    expectedPercent={expectedPercent(netWorthProgress.expected, netWorthGoal)}
                    onTrack={netWorthProgress.onTrack}
                  />
                  <p className="text-muted text-xs">
                    <Money amount={worth.available} /> available, <Money amount={worth.invested} />{" "}
                    invested, <Money amount={worth.locked} /> locked, less{" "}
                    <Money amount={worth.owed} /> owed.
                  </p>
                  {worth.estimated && (
                    <p className="text-faint mt-2 text-xs">
                      Some accounts have no figure for this month, so their last one is carried
                      forward.{" "}
                      <Link href="/assets" className="underline">
                        Update balances
                      </Link>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-muted mt-2 text-sm">
                    Target <Money amount={netWorthGoal.targetAmount} /> in{" "}
                    {netWorthGoal.targetMonths} months.
                  </p>
                  <p className="text-faint mt-2 text-xs">
                    {worth && worth.counted === 0 && hasAccounts
                      ? `No balances were recorded on or before ${formatMonth(month, { long: true })}, so there is nothing to measure this month against.`
                      : "Nothing to measure it against yet. Super, the house and the mortgage are not in a bank statement — they are entered by hand."}{" "}
                    <Link href="/assets" className="underline">
                      {worth && worth.counted === 0 && hasAccounts
                        ? "Enter balances"
                        : "Add accounts"}
                    </Link>
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {hasLedger ? (
        <MonthStrip months={strip} selected={month} href={(m) => `/?month=${m}`} />
      ) : (
        <div className="mb-8">
          <Note>
            No transactions yet, so nothing above the net worth figure is a real month.{" "}
            <Link href="/add" className="underline">
              Import a statement
            </Link>{" "}
            and the monthly verdict, the scenarios and the breakdown all fill in.
          </Note>
        </div>
      )}

      {hasLedger && (
        <>
          <section className="mb-8 grid gap-4 sm:grid-cols-2">
            <div className="border-rule bg-sunk rounded-lg border p-4">
              <p className="eyebrow">Defense — kept from income</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">
                <Money amount={summary.actualSaved} tone />
              </p>
              <p className="text-muted mt-1 text-xs">
                <Money amount={summary.totalIncome} /> in, <Money amount={summary.totalSpent} />{" "}
                out.
              </p>
            </div>
            <div className="border-rule bg-sunk rounded-lg border p-4">
              <p className="eyebrow">Offense — moved to investments</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">
                <Money amount={invested} />
              </p>
              <p className="text-muted mt-1 text-xs">
                {invested > 0
                  ? "Out of cash and into assets. Not spending, and not counted as it."
                  : "Nothing marked as a transfer this month."}
              </p>
            </div>
          </section>

          {ladder.length > 0 && (
            <section className="mb-8">
              <p className="eyebrow mb-2">Against every scenario</p>
              <ul className="border-rule-strong border-t">
                {ladder.map((s) => (
                  <li
                    key={s.scenario.id}
                    className="border-rule flex items-baseline justify-between gap-3 border-b py-2.5"
                  >
                    <span className="flex items-baseline gap-2 text-sm">
                      {s.scenario.name}
                      {s.scenario.active && <span className="text-faint text-xs">ours</span>}
                    </span>
                    <span className="flex items-baseline gap-3">
                      <span className="text-muted text-xs">
                        needs <Money amount={s.required} />
                      </span>
                      <span className="tabular text-sm">
                        <Money amount={s.vsPlan} signed tone />
                      </span>
                      <Verdict good={s.passed}>{s.passed ? "Cleared" : "Short"}</Verdict>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <dl className="border-rule-strong mb-6 border-t">
            <Row label="Total income" value={<Money amount={summary.totalIncome} />} />
            <Row label="Total spent" value={<Money amount={summary.totalSpent} />} />
            <Row label="One-off costs" value={<Money amount={summary.oneOffSpent} />} />
            <Row label="Recurring" value={<Money amount={summary.recurringSpent} />} />
          </dl>

          {month !== thisMonth && (
            <p className="text-faint mb-6 text-xs">
              Reading {formatMonth(month, { long: true })}. Today is in{" "}
              {formatMonth(thisMonth, { long: true })}.
            </p>
          )}

          {summary.needsReviewCount > 0 && (
            <div className="mb-6">
              <Note tone="warn">
                {summary.needsReviewCount} transaction{summary.needsReviewCount > 1 ? "s" : ""}{" "}
                still untagged — counted as spending, but no category owns them.{" "}
                <Link href="/review" className="underline">
                  Review
                </Link>
              </Note>
            </div>
          )}

          <p className="eyebrow mb-2">Category breakdown</p>
          {breakdown.length === 0 ? (
            <Note>Nothing categorised in this month yet.</Note>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="eyebrow border-rule-strong border-b text-left">
                    <th className="pb-2">Category</th>
                    <th className="pb-2 text-right">Target</th>
                    <th className="pb-2 text-right">Actual</th>
                    <th className="pb-2 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((r) => {
                    const denominator = r.target === null ? 0 : Math.max(r.actual, r.target);
                    const fill = denominator ? (r.actual / denominator) * 100 : 0;
                    const mark = denominator ? (r.target! / denominator) * 100 : 0;
                    const over = r.target !== null && r.actual > r.target;
                    return (
                      <tr key={r.categoryId} className="border-rule border-b align-top">
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 flex-none rounded-sm"
                              style={{ background: r.oneOff ? "var(--oneoff)" : "var(--accent)" }}
                            />
                            {r.name}
                          </span>
                          {denominator > 0 && (
                            <span className="bg-track relative mt-1.5 block h-1 rounded">
                              <span
                                className="absolute inset-y-0 left-0 rounded"
                                style={{
                                  width: `${fill.toFixed(1)}%`,
                                  background: over ? "var(--spend)" : "var(--accent)",
                                }}
                              />
                              <span
                                className="bg-ink absolute -top-0.5 -bottom-0.5 w-0.5 rounded"
                                style={{ left: `${mark.toFixed(1)}%` }}
                              />
                            </span>
                          )}
                        </td>
                        <td className="text-muted py-2 pr-3 text-right">
                          {r.target === null ? "—" : <Money amount={r.target} />}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Money amount={r.actual} cents />
                        </td>
                        <td className="py-2 text-right">
                          {r.variance === null ? "—" : <Money amount={r.variance} signed tone />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

/**
 * Cash on hand as the ledger understands it: where the goal started, plus
 * every month kept since.
 *
 * Deliberately not called a balance. Once account snapshots exist they are the
 * authority and this becomes the reconciliation against them — the two will
 * differ by timing and by anything that never crossed the imported account,
 * and showing them as rivals is more honest than picking one.
 */
function progressFromLedger(
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
function expectedPercent(expected: number, goal: Goal): number {
  const journey = goal.targetAmount - goal.openingBalance;
  if (journey <= 0) return 100;
  return Math.max(0, Math.min(100, ((expected - goal.openingBalance) / journey) * 100));
}

function FirstRun({
  hasGoal,
  hasScenarios,
  hasAccounts,
}: {
  hasGoal: boolean;
  hasScenarios: boolean;
  hasAccounts: boolean;
}) {
  const steps = [
    { done: hasGoal, label: "Set what you are aiming at", href: "/goals", cta: "Goals" },
    { done: hasScenarios, label: "Pick the three scenarios", href: "/goals", cta: "Goals" },
    { done: hasAccounts, label: "Add accounts and balances", href: "/assets", cta: "Net worth" },
    { done: false, label: "Import a statement", href: "/add", cta: "Add transactions" },
  ];

  return (
    <>
      <Heading eyebrow="Are we on track?" title="Even Keel" />
      <Empty title="Nothing to score yet">
        Everything on this page is worked out from what you put in, so it fills in as soon as there
        is some. Four steps:
        <ol className="mx-auto mt-4 max-w-xs space-y-2 text-left">
          {steps.map((step) => (
            <li key={step.label} className="flex items-baseline gap-2 text-sm">
              <span aria-hidden style={{ color: step.done ? "var(--pass)" : "var(--faint)" }}>
                {step.done ? "✓" : "○"}
              </span>
              <span style={{ textDecoration: step.done ? "line-through" : undefined }}>
                {step.label}
              </span>
              {!step.done && (
                <Link href={step.href} className="ml-auto underline">
                  {step.cta}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </Empty>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-rule flex items-baseline justify-between gap-4 border-b py-2.5">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className="m-0 font-medium">{value}</dd>
    </div>
  );
}
