import { Money } from "@/components/ui";
import type { monthlySummary } from "@/lib/aggregate";

export function KeptAndInvested({
  summary,
  invested,
}: {
  summary: ReturnType<typeof monthlySummary>;
  invested: number;
}) {
  return (
    <section className="mb-8 grid gap-4 sm:grid-cols-2">
      <div className="border-rule bg-sunk rounded-lg border p-4">
        <p className="eyebrow">Defense — kept from income</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">
          <Money amount={summary.actualSaved} tone />
        </p>
        <p className="text-muted mt-1 text-xs">
          <Money amount={summary.totalIncome} /> in, <Money amount={summary.totalSpent} /> out.
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
  );
}
