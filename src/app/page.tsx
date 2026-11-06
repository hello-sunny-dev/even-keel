import Link from "next/link";
import { MonthStrip, type MonthBar } from "@/components/charts";
import { Heading, Note } from "@/components/ui";
import {
  availableMonths,
  categoryBreakdown,
  monthlySummary,
  movedOut,
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
import { goalProgress, scoreScenarios } from "@/lib/goals";
import { addMonths, formatMonth, monthIndex, monthRange } from "@/lib/months";
import { netWorthAt } from "@/lib/networth";
import { requireSession } from "@/lib/session";
import { CashGoalCard } from "./_dashboard/CashGoalCard";
import { CategoryBreakdownTable } from "./_dashboard/CategoryBreakdownTable";
import { FirstRun } from "./_dashboard/FirstRun";
import { KeptAndInvested } from "./_dashboard/KeptAndInvested";
import { MonthPicker } from "./_dashboard/MonthPicker";
import { MonthTotals } from "./_dashboard/MonthTotals";
import { NetWorthGoalCard } from "./_dashboard/NetWorthGoalCard";
import { progressFromLedger } from "./_dashboard/progress";
import { ScenarioLadder } from "./_dashboard/ScenarioLadder";

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
  const hasLedger = ledgerMonths.length > 0;
  // Any month inside the ledger's span is selectable, not only the ones that
  // have rows. The month strip is the navigation, and a bar that bounces the
  // reader back to the newest month is a link that does nothing — a month
  // between the first statement and the last with nothing in it is a real
  // answer, and one worth being able to look at.
  const selectable =
    requested !== undefined &&
    (months.includes(requested) ||
      (hasLedger &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) &&
        monthIndex(requested) >= monthIndex(ledgerMonths[ledgerMonths.length - 1]) &&
        monthIndex(requested) <= monthIndex(ledgerMonths[0])));
  const month = selectable ? requested : (months[0] ?? thisMonth);

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

  return (
    <>
      <Heading eyebrow="Are we on track?" title={formatMonth(month, { long: true })} />

      {hasLedger && <MonthPicker month={month} months={months} />}

      {(cashProgress || netWorthGoal) && (
        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          {cashProgress && <CashGoalCard cashProgress={cashProgress} month={month} />}

          {netWorthGoal && (
            <NetWorthGoalCard
              netWorthGoal={netWorthGoal}
              netWorthProgress={netWorthProgress}
              worth={worth}
              hasAccounts={hasAccounts}
              month={month}
            />
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
          <KeptAndInvested summary={summary} invested={invested} />

          {ladder.length > 0 && <ScenarioLadder ladder={ladder} />}

          <MonthTotals summary={summary} />

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
            <CategoryBreakdownTable breakdown={breakdown} />
          )}
        </>
      )}
    </>
  );
}
