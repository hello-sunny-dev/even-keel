import { Money } from "@/components/ui";
import type { monthlySummary } from "@/lib/aggregate";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-rule flex items-baseline justify-between gap-4 border-b py-2.5">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className="m-0 font-medium">{value}</dd>
    </div>
  );
}

export function MonthTotals({ summary }: { summary: ReturnType<typeof monthlySummary> }) {
  return (
    <dl className="border-rule-strong mb-6 border-t">
      <Row label="Total income" value={<Money amount={summary.totalIncome} />} />
      <Row label="Total spent" value={<Money amount={summary.totalSpent} />} />
      <Row label="One-off costs" value={<Money amount={summary.oneOffSpent} />} />
      <Row label="Recurring" value={<Money amount={summary.recurringSpent} />} />
    </dl>
  );
}
