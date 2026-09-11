import { afterEach, describe, expect, it } from "vitest";
import { categoryBreakdown, type Txn } from "@/lib/aggregate";
import {
  categoryMap,
  createCategory,
  insertTransactions,
  listCategories,
  listTransactions,
  listUserRules,
  mergeCategories,
  rememberMerchant,
  setCategorySettings,
} from "@/lib/db/queries";
import type { Db } from "@/lib/db/port";
import { freshDb, txn } from "./support/db";

let open: Db | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

describe("a category the household made up", () => {
  it("gets a readable id, and a second one of the same name does not collide", async () => {
    const { db, household } = await freshDb();
    open = db;

    const first = await createCategory(db, household, {
      name: "Dog things",
      group: "Pet",
      kind: "expense",
      oneOff: false,
      cadence: { unit: "month", count: 1 },
    });
    const second = await createCategory(db, household, {
      name: "Dog things",
      group: "Pet",
      kind: "expense",
      oneOff: false,
      cadence: { unit: "month", count: 1 },
    });

    expect(first).toBe("dog-things");
    expect(second).toBe("dog-things-2");
  });

  it("keeps its id when it is renamed, so nothing filed under it is orphaned", async () => {
    const { db, household } = await freshDb();
    open = db;

    const id = await createCategory(db, household, {
      name: "Dog",
      group: "Pet",
      kind: "expense",
      oneOff: false,
      cadence: { unit: "month", count: 1 },
    });
    await insertTransactions(db, household, [txn({ categoryId: id, amount: -40 })]);
    await setCategorySettings(db, household, id, { name: "Bilbo" });

    const rows: Txn[] = await listTransactions(db, household);
    const breakdown = categoryBreakdown(rows, "2025-03", await categoryMap(db, household));
    expect(breakdown.find((r) => r.categoryId === id)?.name).toBe("Bilbo");
    expect(rows[0].categoryId).toBe(id);
  });
});

describe("folding one category into another", () => {
  it("moves the transactions, moves the rules, and archives the empty one", async () => {
    const { db, household } = await freshDb();
    open = db;
    await insertTransactions(db, household, [
      txn({ categoryId: "food-dining", amount: -18, sourceFingerprint: "a" }),
      txn({ categoryId: "food-dining", amount: -22, sourceFingerprint: "b" }),
      txn({ categoryId: "food-groceries", amount: -90, sourceFingerprint: "c" }),
    ]);
    await rememberMerchant(db, household, "MUZZ BUZZ", "food-dining");

    const moved = await mergeCategories(db, household, "food-dining", "food-groceries");
    expect(moved).toBe(2);

    const rows: Txn[] = await listTransactions(db, household);
    expect(rows.every((r) => r.categoryId === "food-groceries")).toBe(true);

    // The rule has to move too. Left behind, it would keep filing every future
    // Muzz Buzz into a category that is no longer on screen.
    const rules = await listUserRules(db, household);
    expect(rules.find((r) => r.pattern === "MUZZ BUZZ")?.categoryId).toBe("food-groceries");

    const categories = await listCategories(db, household);
    expect(categories.find((c) => c.id === "food-dining")?.archived).toBe(true);
  });

  it("leaves the merged-away name readable, so old rows still say what they were", async () => {
    const { db, household } = await freshDb();
    open = db;
    await mergeCategories(db, household, "food-dining", "food-groceries");

    // Archived, but still in the map the aggregates read.
    expect((await categoryMap(db, household)).get("food-dining")?.name).toBe(
      "Dining / Cafe / Takeaway",
    );
  });
});

describe("archiving", () => {
  it("goes both ways", async () => {
    const { db, household } = await freshDb();
    open = db;

    await setCategorySettings(db, household, "sub-hbo-max", { archived: true });
    expect(
      (await listCategories(db, household)).find((c) => c.id === "sub-hbo-max")?.archived,
    ).toBe(true);

    await setCategorySettings(db, household, "sub-hbo-max", { archived: false });
    expect(
      (await listCategories(db, household)).find((c) => c.id === "sub-hbo-max")?.archived,
    ).toBe(false);
  });
});
