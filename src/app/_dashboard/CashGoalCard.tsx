import { GoalBar, Verdict } from "@/components/charts";
import { Money } from "@/components/ui";
import type { goalProgress } from "@/lib/goals";
import { formatMonth } from "@/lib/months";
import { expectedPercent } from "./progress";

export function CashGoalCard({
  cashProgress,
  month,
}: {
  cashProgress: ReturnType<typeof goalProgress>;
  month: string;
}) {
  return (
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
        Worked out from the ledger, not from a bank balance — money this app has never seen is not
        in it.
      </p>
    </div>
  );
}
