import { Empty, Heading, Money } from "@/components/ui";
import { listTransactions } from "@/lib/db/queries";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Review() {
  const { db, household: id } = await requireSession();
  const queue = await listTransactions(db, id, { needsReview: true, limit: 200 });

  return (
    <>
      <Heading
        eyebrow="Tagging queue"
        title={queue.length === 0 ? "Nothing to tag" : `${queue.length} need a category`}
        lede="Anything that did not match a rule cleanly lands here rather than being guessed at — a wrong category nobody is asked about is worse than an untagged one."
      />

      {queue.length === 0 ? (
        <Empty title="The queue is empty">New statements will refill it.</Empty>
      ) : (
        <ul className="space-y-3">
          {queue.map((r) => (
            <li key={r.id} className="border-rule bg-sheet rounded-xl border p-4">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="font-medium">{r.description}</p>
                  <p className="tabular text-faint text-xs">{r.date} · nothing matched</p>
                </div>
                <p className="text-lg font-semibold">
                  <Money amount={r.amount} cents />
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
