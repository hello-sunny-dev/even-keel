import Link from "next/link";
import { GoalBar, Verdict } from "@/components/charts";
import { Money } from "@/components/ui";
import type { Goal, goalProgress } from "@/lib/goals";
import { formatMonth } from "@/lib/months";
import type { netWorthAt } from "@/lib/networth";
import { expectedPercent } from "./progress";

export function NetWorthGoalCard({
  netWorthGoal,
  netWorthProgress,
  worth,
  hasAccounts,
  month,
}: {
  netWorthGoal: Goal;
  netWorthProgress: ReturnType<typeof goalProgress> | null;
  worth: ReturnType<typeof netWorthAt> | null;
  hasAccounts: boolean;
  month: string;
}) {
  return (
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
            invested, <Money amount={worth.locked} /> locked, less <Money amount={worth.owed} />{" "}
            owed.
          </p>
          {worth.estimated && (
            <p className="text-faint mt-2 text-xs">
              Some accounts have no figure for this month, so their last one is carried forward.{" "}
              <Link href="/assets" className="underline">
                Update balances
              </Link>
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-muted mt-2 text-sm">
            Target <Money amount={netWorthGoal.targetAmount} /> in {netWorthGoal.targetMonths}{" "}
            months.
          </p>
          <p className="text-faint mt-2 text-xs">
            {worth && worth.counted === 0 && hasAccounts
              ? `No balances were recorded on or before ${formatMonth(month, { long: true })}, so there is nothing to measure this month against.`
              : "Nothing to measure it against yet. Super, the house and the mortgage are not in a bank statement — they are entered by hand."}{" "}
            <Link href="/assets" className="underline">
              {worth && worth.counted === 0 && hasAccounts ? "Enter balances" : "Add accounts"}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
