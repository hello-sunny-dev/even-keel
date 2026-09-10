import { Empty, Heading, Money } from "@/components/ui";
import { getCategory } from "@/lib/categories";
import { listTransactions } from "@/lib/db/queries";
import { household } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Ledger({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { db, household: id } = await household();
  const search = (await searchParams).q ?? "";
  const rows = await listTransactions(db, id, { search: search || undefined, limit: 500 });

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
                const category = getCategory(r.categoryId);
                return (
                  <tr
                    key={r.id}
                    className="border-rule border-b"
                    style={{ opacity: r.isSplitParent ? 0.45 : 1 }}
                  >
                    <td className="tabular text-muted py-2 pr-3 whitespace-nowrap">{r.date}</td>
                    <td className="py-2 pr-3">
                      {r.description}
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
                      <Money amount={r.amount} cents tone />
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
