import Link from "next/link";
import { Empty, Heading, Money, Note } from "@/components/ui";
import { availableMonths, categoryBreakdown, monthlySummary, type Txn } from "@/lib/aggregate";
import { listCategories, listTransactions } from "@/lib/db/queries";
import { formatMonth } from "@/lib/months";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { db, household: id } = await requireSession();
  const [rows, categories] = await Promise.all([listTransactions(db, id), listCategories(db, id)]);

  const txns: Txn[] = rows;
  const months = availableMonths(txns);
  const requested = (await searchParams).month;
  const month = requested && months.includes(requested) ? requested : months[0];

  if (!month) {
    return (
      <>
        <Heading eyebrow="Are we on track?" title="Even Keel" />
        <Empty title="Nothing here yet">
          Import a statement to get started. Everything else — the month verdict, the category
          breakdown, the trend — is derived from transactions, so this fills in as soon as there are
          some.
          <div className="mt-4">
            <Link
              href="/add"
              className="bg-ink text-paper inline-block rounded-lg px-4 py-2 text-sm font-medium"
            >
              Add transactions
            </Link>
          </div>
        </Empty>
      </>
    );
  }

  const summary = monthlySummary(txns, month, null);
  const targets = new Map(
    categories.filter((c) => c.targetMonthly !== null).map((c) => [c.id, c.targetMonthly!]),
  );
  const breakdown = categoryBreakdown(txns, month, targets);

  return (
    <>
      <Heading eyebrow="Are we on track?" title={formatMonth(month, { long: true })} />

      <div className="mb-6 flex flex-wrap gap-2">
        {months.map((m) => (
          <Link
            key={m}
            href={`/?month=${m}`}
            className="rounded-full border px-3 py-1 text-sm"
            style={
              m === month
                ? { background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" }
                : { borderColor: "var(--rule)", color: "var(--muted)" }
            }
          >
            {formatMonth(m, { long: true })}
          </Link>
        ))}
      </div>

      <dl className="border-rule-strong mb-6 border-t">
        <Row label="Total income" value={<Money amount={summary.totalIncome} />} />
        <Row label="Total spent" value={<Money amount={summary.totalSpent} />} />
        <div className="border-rule flex items-baseline justify-between gap-4 border-b py-4">
          <dt className="text-sm font-medium">Actual saved</dt>
          <dd className="m-0 text-3xl font-semibold tracking-tight">
            <Money amount={summary.actualSaved} tone />
          </dd>
        </div>
        <Row label="One-off costs" value={<Money amount={summary.oneOffSpent} />} />
        <Row label="Recurring" value={<Money amount={summary.recurringSpent} />} />
      </dl>

      {summary.needsReviewCount > 0 && (
        <div className="mb-6">
          <Note tone="warn">
            {summary.needsReviewCount} transaction{summary.needsReviewCount > 1 ? "s" : ""} still
            untagged — counted as spending, but no category owns them.{" "}
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
