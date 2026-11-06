import Link from "next/link";
import { Button, Empty, Heading, Money, Note } from "@/components/ui";
import {
  availableMonths,
  monthlySummary,
  oneOffRows,
  forMonth,
  isOneOff,
  effectiveKind,
  type Txn,
} from "@/lib/aggregate";
import { currentMonthIn } from "@/lib/dates";
import { listCategories, listTransactions, type TxnRow } from "@/lib/db/queries";
import { formatMonth, monthIndex } from "@/lib/months";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const HISTORY_MONTHS = 12;

export default async function OneOffs({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { db, household, settings } = await requireSession();
  const [rows, categoryList] = await Promise.all([
    listTransactions(db, household),
    listCategories(db, household),
  ]);

  const categories = new Map(categoryList.map((c) => [c.id, c]));
  const months = availableMonths(rows as Txn[]);
  const requested = (await searchParams).month;
  const thisMonth = currentMonthIn(settings.timeZone);
  const month = requested && months.includes(requested) ? requested : (months[0] ?? thisMonth);

  const costs = oneOffRows<TxnRow>(rows, month, categories);
  const credits = forMonth(rows, month).filter(
    (t) => effectiveKind(t, categories) === "income" && isOneOff(t, categories),
  );
  const summary = monthlySummary(rows as Txn[], month, categories);

  // The same figure the dashboard prints, recomputed from the rows on screen.
  // If these two ever disagree the page is lying about something, so it says
  // so rather than quietly showing a different total.
  const listed = Number(costs.reduce((sum, t) => sum - t.amount, 0).toFixed(2));
  const agrees = Math.abs(listed - summary.oneOffSpent) < 0.005;

  const history = months
    .filter((m) => monthIndex(m) <= monthIndex(month))
    .slice(0, HISTORY_MONTHS)
    .map((m) => ({ month: m, total: monthlySummary(rows as Txn[], m, categories).oneOffSpent }));
  const busiest = Math.max(...history.map((h) => h.total), 0);

  return (
    <>
      <Heading
        eyebrow="What made this month unusual"
        title="One-off costs"
        lede="Costs that are not going to happen again, kept out of every recurring average. A one-off is a flag on the category or on the row itself — never a word in a name, which is all the spreadsheet could manage."
      />

      {months.length === 0 ? (
        <Empty title="Nothing recorded yet">
          One-off costs appear here as soon as there are transactions to draw them from.{" "}
          <Link href="/add" className="underline">
            Import a statement
          </Link>
          .
        </Empty>
      ) : (
        <>
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
            <Button variant="secondary" type="submit">
              Show
            </Button>
          </form>

          <section className="border-rule bg-sunk mb-8 rounded-lg border p-4">
            <p className="eyebrow">One-off costs in {formatMonth(month, { long: true })}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              <Money amount={summary.oneOffSpent} />
            </p>
            <p className="text-muted mt-1 text-xs">
              {costs.length === 0 ? (
                "Nothing unusual this month."
              ) : (
                <>
                  {costs.length} cost{costs.length === 1 ? "" : "s"}, out of{" "}
                  <Money amount={summary.totalSpent} /> spent in all.
                </>
              )}
            </p>
            {!agrees && (
              <p className="mt-2 text-xs" style={{ color: "var(--fail)" }}>
                The rows below add up to <Money amount={listed} />, which is not the same figure.
                Something is being counted in one place and not the other.
              </p>
            )}
          </section>

          {costs.length === 0 ? (
            <Note>
              Every cost this month is a recurring one. That is a clean month, not a missing page.
            </Note>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="eyebrow border-rule-strong border-b text-left">
                    <th className="pb-2">What</th>
                    <th className="pb-2">Category</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((t) => (
                    <tr key={t.id} className="border-rule border-b align-top">
                      <td className="py-2 pr-3">
                        <span className="block">{t.description}</span>
                        <span className="text-faint tabular text-xs">
                          {t.granularity === "month" ? (
                            <>
                              {formatMonth(t.month, { long: true })} ·{" "}
                              <span style={{ color: "var(--warn-text)" }}>month total</span>
                            </>
                          ) : (
                            t.date
                          )}
                          {t.oneOffOverride !== null && " · marked by hand"}
                        </span>
                      </td>
                      <td className="text-muted py-2 pr-3">
                        {t.categoryId
                          ? (categories.get(t.categoryId)?.name ?? t.categoryId)
                          : "untagged"}
                      </td>
                      <td className="py-2 text-right">
                        <Money amount={-t.amount} cents />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {credits.length > 0 && (
            <section className="mt-8">
              <p className="eyebrow mb-2">One-off money in</p>
              <p className="text-muted mb-3 max-w-prose text-sm">
                Refunds, bonds back, a tax return. Kept out of core income for the same reason the
                costs above are kept out of recurring: planning against it once is planning against
                it every month.
              </p>
              <ul className="border-rule-strong border-t">
                {credits.map((t) => (
                  <li
                    key={t.id}
                    className="border-rule flex items-baseline justify-between gap-3 border-b py-2.5"
                  >
                    <span className="min-w-0 text-sm">{t.description}</span>
                    <Money amount={t.amount} cents signed />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {history.length > 1 && (
            <section className="mt-10">
              <p className="eyebrow mb-2">One-off costs by month</p>
              <p className="text-muted mb-3 max-w-prose text-sm">
                A lumpy row is the point. These are the months a trailing average would have been
                wrong about, which is why they are held apart from it.
              </p>
              <ul className="space-y-1.5">
                {history.map((h) => (
                  <li key={h.month} className="flex items-center gap-3">
                    <Link
                      href={`/one-offs?month=${h.month}`}
                      className="w-20 flex-none text-xs"
                      style={{ color: h.month === month ? "var(--ink)" : "var(--muted)" }}
                      aria-current={h.month === month ? "page" : undefined}
                    >
                      {formatMonth(h.month)}
                    </Link>
                    <span className="bg-track relative h-2 flex-1 rounded">
                      <span
                        className="absolute inset-y-0 left-0 rounded"
                        style={{
                          width: busiest > 0 ? `${((h.total / busiest) * 100).toFixed(1)}%` : "0%",
                          background: h.month === month ? "var(--ink)" : "var(--oneoff)",
                        }}
                      />
                    </span>
                    <span className="tabular w-24 flex-none text-right text-xs">
                      <Money amount={h.total} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
