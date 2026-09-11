import { Empty, Heading, Money } from "@/components/ui";
import { lookUp } from "@/lib/categories";
import { categoryMap, listTransactions } from "@/lib/db/queries";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Ledger({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { db, household: id } = await requireSession();
  const search = (await searchParams).q ?? "";
  const [rows, categories] = await Promise.all([
    listTransactions(db, id, {
      search: search || undefined,
      limit: 500,
      granularity: "transaction",
    }),
    categoryMap(db, id),
  ]);

  return (
    <>
      <Heading
        eyebrow="Everything imported"
        title="Ledger"
        lede="Every transaction, searchable. This is where a category gets fixed once it has left the review queue."
      />

      <form className="mb-5">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search descriptions…"
          className="border-rule-strong bg-sheet w-full rounded-lg border px-3 py-2 text-sm sm:max-w-xs"
        />
      </form>

      {rows.length === 0 ? (
        <Empty title={search ? "Nothing matched" : "No transactions yet"}>
          {search ? `Nothing in the ledger matches “${search}”.` : "Import a statement first."}
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="eyebrow border-rule-strong border-b text-left">
                <th className="pb-2">Date</th>
                <th className="pb-2">Description</th>
                <th className="pb-2">Category</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const category = lookUp(categories, r.categoryId);
                return (
                  // Struck through, not faded. Opacity dimmed a superseded row
                  // to 1.8:1 against the page — far under the readable
                  // minimum — and a row nobody can read is not de-emphasised,
                  // it is hidden. The rule through the figure says the same
                  // thing and the words beside it say it out loud.
                  <tr key={r.id} className="border-rule border-b">
                    <td className="tabular text-muted py-2 pr-3 whitespace-nowrap">{r.date}</td>
                    <td className="py-2 pr-3">
                      <span className={r.isSplitParent ? "text-muted line-through" : undefined}>
                        {r.description}
                      </span>
                      {r.isSplitParent && (
                        <span className="text-faint ml-2 text-xs">split — parts count instead</span>
                      )}
                    </td>
                    <td className="text-muted py-2 pr-3">
                      {category ? (
                        category.name
                      ) : (
                        <span className="text-faint italic">needs tagging</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <span className={r.isSplitParent ? "text-muted line-through" : undefined}>
                        <Money amount={r.amount} cents tone={!r.isSplitParent} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-faint mt-3 text-xs">{rows.length} shown</p>
        </div>
      )}
    </>
  );
}
