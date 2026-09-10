import { Empty, Heading, Note } from "@/components/ui";
import { countMerchantHistory, listCategories, listTransactions } from "@/lib/db/queries";
import { requireSession } from "@/lib/session";
import { ReviewQueue } from "./ReviewQueue";

export const dynamic = "force-dynamic";

export default async function Review() {
  const { db, household: id } = await requireSession();
  const [queue, categories] = await Promise.all([
    listTransactions(db, id, { needsReview: true, limit: 200 }),
    listCategories(db, id),
  ]);

  // How many other untagged rows share each merchant, so the offer to fix the
  // history can say how many rather than asking in the abstract. Counted once
  // per merchant, not once per row.
  const merchants = [...new Set(queue.map((r) => r.merchantKey).filter(Boolean))];
  const counts = new Map(
    await Promise.all(
      merchants.map(
        async (key) => [key, await countMerchantHistory(db, id, key)] as [string, number],
      ),
    ),
  );

  const rows = queue.map((row) => ({
    ...row,
    // Not counting itself: the offer is about the others.
    siblings: Math.max(0, (counts.get(row.merchantKey) ?? 0) - 1),
  }));

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
        <>
          <ReviewQueue rows={rows} categories={categories.filter((c) => !c.archived)} />
          <div className="mt-6">
            <Note>
              Tagging one of these can fix every earlier transaction from the same merchant, and
              teach the app to tag the next one itself. Both are offered separately, because
              correcting the past and deciding the future are different choices.
            </Note>
          </div>
        </>
      )}
    </>
  );
}
