import { Importer } from "./Importer";
import { Heading, Note } from "@/components/ui";
import { listCategories } from "@/lib/db/queries";
import { household } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AddPage() {
  const { db, household: id } = await household();
  const categories = await listCategories(db, id);

  return (
    <>
      <Heading
        eyebrow="Import"
        title="Add transactions"
        lede="Several statements at once — a bill that arrives every two months is invisible in a single one, so the recurring figures only mean something once there is history."
      />
      <Importer categories={categories} />
      <div className="mt-6">
        <Note>
          Each file is checked against its own printed balances before anything is written, and rows
          that are already in the ledger are marked rather than silently dropped.
        </Note>
      </div>
    </>
  );
}
