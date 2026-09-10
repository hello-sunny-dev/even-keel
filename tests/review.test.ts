import { afterEach, describe, expect, it } from "vitest";
import { monthlySummary } from "@/lib/aggregate";
import { categorize } from "@/lib/categorize";
import {
  applyToMerchantHistory,
  categoriseTransaction,
  categoryMap,
  countMerchantHistory,
  insertTransactions,
  listTransactions,
  listUserRules,
  rememberMerchant,
  splitTransaction,
} from "@/lib/db/queries";
import type { Db } from "@/lib/db/port";
import { freshDb, txn } from "./support/db";

let open: Db | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

async function withUntagged(count: number) {
  const { db, household } = await freshDb();
  await insertTransactions(
    db,
    household,
    Array.from({ length: count }, (_, i) =>
      txn({
        date: `2025-0${i + 1}-05`,
        month: `2025-0${i + 1}`,
        description: "ZEPHYR TRADING CO",
        merchantKey: "ZEPHYR TRADING CO",
        categoryId: null,
        needsReview: true,
        sourceFingerprint: `z${i}`,
      }),
    ),
  );
  return { db, household };
}

describe("tagging one row fixes the merchant's history", () => {
  it("applies to every other untagged transaction from the same merchant", async () => {
    const { db, household } = await withUntagged(4);
    open = db;
    const queue = await listTransactions(db, household, { needsReview: true });
    expect(queue).toHaveLength(4);

    await categoriseTransaction(db, household, queue[0].id, { categoryId: "food-groceries" });
    const applied = await applyToMerchantHistory(
      db,
      household,
      "ZEPHYR TRADING CO",
      "food-groceries",
    );

    expect(applied).toBe(3);
    expect(await listTransactions(db, household, { needsReview: true })).toHaveLength(0);
  });

  it("counts the others without counting the one being tagged", async () => {
    const { db, household } = await withUntagged(4);
    open = db;

    expect(await countMerchantHistory(db, household, "ZEPHYR TRADING CO")).toBe(4);
  });

  it("leaves a category somebody already chose alone", async () => {
    const { db, household } = await withUntagged(3);
    open = db;
    const queue = await listTransactions(db, household, { needsReview: true });
    await categoriseTransaction(db, household, queue[0].id, { categoryId: "personal-care" });

    await applyToMerchantHistory(db, household, "ZEPHYR TRADING CO", "food-groceries");

    const all = await listTransactions(db, household);
    expect(all.filter((r) => r.categoryId === "personal-care")).toHaveLength(1);
    expect(all.filter((r) => r.categoryId === "food-groceries")).toHaveLength(2);
  });

  it("does not count or touch a split parent", async () => {
    // A parent has no category by design — its children carry them — so it
    // looks untagged to anything asking only about `category_id`.
    const { db, household } = await withUntagged(2);
    open = db;
    const [first] = await listTransactions(db, household, { needsReview: true });
    await splitTransaction(db, household, first.id, [
      { amount: -100, categoryId: "food-groceries", oneOffOverride: null },
      { amount: -84.55, categoryId: "food-dining", oneOffOverride: null },
    ]);

    expect(await countMerchantHistory(db, household, "ZEPHYR TRADING CO")).toBe(1);
    expect(await applyToMerchantHistory(db, household, "ZEPHYR TRADING CO", "food-groceries")).toBe(
      1,
    );

    const all = await listTransactions(db, household);
    expect(all.find((r) => r.id === first.id)?.categoryId).toBeNull();
  });

  it("does not reach into another merchant", async () => {
    const { db, household } = await withUntagged(2);
    open = db;
    await insertTransactions(db, household, [
      txn({
        description: "OTHER SHOP",
        merchantKey: "OTHER SHOP",
        categoryId: null,
        needsReview: true,
        sourceFingerprint: "other",
      }),
    ]);

    await applyToMerchantHistory(db, household, "ZEPHYR TRADING CO", "food-groceries");

    const left = await listTransactions(db, household, { needsReview: true });
    expect(left.map((r) => r.merchantKey)).toEqual(["OTHER SHOP"]);
  });
});

describe("remembering a merchant", () => {
  it("tags the next statement without being asked again", async () => {
    const { db, household } = await freshDb();
    open = db;

    expect(categorize("ZEPHYR TRADING CO", await categoryMap(db, household)).status).toBe(
      "needs_review",
    );

    await rememberMerchant(db, household, "ZEPHYR TRADING CO", "food-groceries");
    const rules = await listUserRules(db, household);

    const decided = categorize("ZEPHYR TRADING CO", await categoryMap(db, household), rules);
    expect(decided).toMatchObject({ status: "matched", categoryId: "food-groceries" });
  });

  it("is scoped to the household that made it", async () => {
    const { db, household } = await freshDb();
    open = db;
    const other = await (await import("@/lib/db/queries")).createHousehold(db, "Someone else");

    await rememberMerchant(db, household, "ZEPHYR TRADING CO", "food-groceries");

    expect(await listUserRules(db, other)).toHaveLength(0);
  });
});

describe("splitting a bundled charge", () => {
  it("replaces the parent's amount with parts that add up", async () => {
    const { db, household } = await freshDb();
    open = db;
    await insertTransactions(db, household, [
      txn({ description: "INTERNET SETUP + FIRST MONTH", amount: -219, categoryId: null }),
    ]);
    const [parent] = await listTransactions(db, household);

    await splitTransaction(db, household, parent.id, [
      { amount: -99, categoryId: "oneoff-home-hardware", oneOffOverride: true },
      { amount: -120, categoryId: "utilities-internet", oneOffOverride: null },
    ]);

    const all = await listTransactions(db, household);
    const categories = await categoryMap(db, household);

    // Three rows, but the parent no longer counts — the month is still $219.
    expect(all).toHaveLength(3);
    expect(all.find((r) => r.id === parent.id)?.isSplitParent).toBe(true);
    expect(monthlySummary(all, "2025-03", categories).totalSpent).toBe(219);
    expect(monthlySummary(all, "2025-03", categories).oneOffSpent).toBe(99);
  });

  it("refuses parts that do not add up, leaving the row as it was", async () => {
    const { db, household } = await freshDb();
    open = db;
    await insertTransactions(db, household, [txn({ amount: -219, categoryId: null })]);
    const [parent] = await listTransactions(db, household);

    await expect(
      splitTransaction(db, household, parent.id, [
        { amount: -99, categoryId: "oneoff-home-hardware", oneOffOverride: null },
        { amount: -100, categoryId: "utilities-internet", oneOffOverride: null },
      ]),
    ).rejects.toThrow(/add up/);

    expect(await listTransactions(db, household)).toHaveLength(1);
  });

  it("replaces an earlier split rather than stacking a second one", async () => {
    const { db, household } = await freshDb();
    open = db;
    await insertTransactions(db, household, [txn({ amount: -219, categoryId: null })]);
    const [parent] = await listTransactions(db, household);

    await splitTransaction(db, household, parent.id, [
      { amount: -99, categoryId: "oneoff-home-hardware", oneOffOverride: null },
      { amount: -120, categoryId: "utilities-internet", oneOffOverride: null },
    ]);
    await splitTransaction(db, household, parent.id, [
      { amount: -19, categoryId: "oneoff-home-hardware", oneOffOverride: null },
      { amount: -200, categoryId: "utilities-internet", oneOffOverride: null },
    ]);

    const all = await listTransactions(db, household);
    expect(all).toHaveLength(3);
    expect(monthlySummary(all, "2025-03", await categoryMap(db, household)).totalSpent).toBe(219);
  });
});
