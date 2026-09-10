import Link from "next/link";
import { Importer } from "./Importer";
import { OneTransaction, WholeMonth } from "./ManualEntry";
import { Heading, Note } from "@/components/ui";
import { currentMonthIn, todayIn } from "@/lib/dates";
import { categoriesWithHistory, listCategories, monthTotals } from "@/lib/db/queries";
import { addMonths, formatMonth } from "@/lib/months";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "statement", label: "Statement" },
  { id: "one", label: "One transaction" },
  { id: "month", label: "Whole month" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const { db, household: id, settings } = await requireSession();
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === params.tab) ? (params.tab as Tab) : "statement";

  const thisMonth = currentMonthIn(settings.timeZone);
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : thisMonth;

  const [categories, used, existing, previous] = await Promise.all([
    listCategories(db, id),
    tab === "month" ? categoriesWithHistory(db, id) : Promise.resolve([]),
    tab === "month" ? monthTotals(db, id, month) : Promise.resolve([]),
    tab === "month" ? monthTotals(db, id, addMonths(month, -1)) : Promise.resolve([]),
  ]);

  const live = categories.filter((c) => !c.archived);

  return (
    <>
      <Heading
        eyebrow="Add"
        title="Add transactions"
        lede="The bank sends a statement once a quarter. Everything in between is entered here, and all three ways end up in the same figures."
      />

      <nav className="border-rule mb-6 flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/add?tab=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className="-mb-px border-b-2 px-3 py-2 text-sm"
            style={{
              borderColor: t.id === tab ? "var(--ink)" : "transparent",
              color: t.id === tab ? "var(--ink)" : "var(--muted)",
            }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "statement" && (
        <>
          <Importer categories={live} />
          <div className="mt-6">
            <Note>
              Several at once — a bill that arrives every two months is invisible in a single
              statement. Each file is checked against its own printed balances before anything is
              written, and rows already in the ledger are marked rather than silently dropped.
            </Note>
          </div>
        </>
      )}

      {tab === "one" && <OneTransaction categories={live} today={todayIn(settings.timeZone)} />}

      {tab === "month" && (
        <>
          <form className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="month" />
            <label>
              <span className="eyebrow">Month</span>
              <input
                type="month"
                name="month"
                defaultValue={month}
                className="border-rule-strong bg-sheet mt-1 rounded-lg border px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="border-rule-strong rounded-lg border px-3 py-2 text-sm"
            >
              Show {formatMonth(month, { long: true })}
            </button>
          </form>
          <WholeMonth
            categories={live}
            used={used}
            month={month}
            existing={existing}
            previous={previous}
          />
        </>
      )}
    </>
  );
}
