import { afterEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/port";
import {
  applyToMerchantHistory,
  categoriseTransaction,
  createHousehold,
  insertTransactions,
  listCategories,
  listTransactions,
  listUserRules,
  mergeCategories,
  recordUpload,
  rememberMerchant,
  seedCategories,
  setCategorySettings,
  splitTransaction,
  undoUpload,
} from "@/lib/db/queries";
import { freshDb, txn } from "./support/db";

let open: Db | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

describe("importing the same statement twice", () => {
  it("inserts nothing the second time", async () => {
    const { db, household } = await freshDb();
    open = db;
    const rows = [txn(), txn({ sourceFingerprint: "b", description: "COLES", amount: -20 })];

    expect(await insertTransactions(db, household, rows)).toBe(2);
    expect(await insertTransactions(db, household, rows)).toBe(0);
    expect(await listTransactions(db, household)).toHaveLength(2);
  });

  it("keeps two identical charges on one day, because they are two charges", async () => {
    const { db, household } = await freshDb();
    open = db;

    const inserted = await insertTransactions(db, household, [
      txn({ description: "APPLE.COM/BILL", amount: -4.49, sourceFingerprint: "apple|#1" }),
      txn({ description: "APPLE.COM/BILL", amount: -4.49, sourceFingerprint: "apple|#2" }),
    ]);

    expect(inserted).toBe(2);
  });

  it("lets an undone import be imported again", async () => {
    const { db, household } = await freshDb();
    open = db;
    const uploadId = await recordUpload(db, household, {
      kind: "pdf",
      files: 1,
      parsed: 1,
      skipped: 0,
    });

    await insertTransactions(db, household, [txn()], uploadId);
    expect(await undoUpload(db, household, uploadId)).toBe(1);
    expect(await listTransactions(db, household)).toHaveLength(0);

    // The fingerprint index ignores soft-deleted rows, so a mistaken undo is
    // recoverable by importing the file again.
    expect(await insertTransactions(db, household, [txn()])).toBe(1);
  });
});

describe("splitting a bundled charge", () => {
  it("replaces the parent's weight with its parts", async () => {
    const { db, household } = await freshDb();
    open = db;
    await insertTransactions(db, household, [
      txn({
        description: "COWAY WATER PURIFIER INSTALL + RENTAL",
        amount: -289,
        categoryId: "sub-water-purifier",
        sourceFingerprint: "coway",
      }),
    ]);
    const [parent] = await listTransactions(db, household);

    await splitTransaction(db, household, parent.id, [
      { amount: -240, categoryId: "oneoff-large-purchase", oneOffOverride: true },
      { amount: -49, categoryId: "sub-water-purifier", oneOffOverride: false },
    ]);

    const rows = await listTransactions(db, household);
    const counted = rows.filter((r) => !r.isSplitParent);
    expect(rows).toHaveLength(3);
    expect(counted).toHaveLength(2);
    expect(counted.reduce((sum, r) => sum + r.amount, 0)).toBeCloseTo(-289, 2);
  });

  it("refuses parts that do not add up", async () => {
    const { db, household } = await freshDb();
    open = db;
    await insertTransactions(db, household, [txn({ amount: -289, sourceFingerprint: "c" })]);
    const [parent] = await listTransactions(db, household);

    await expect(
      splitTransaction(db, household, parent.id, [
        { amount: -240, categoryId: "oneoff-large-purchase", oneOffOverride: true },
      ]),
    ).rejects.toThrow(/add up/);

    expect(await listTransactions(db, household)).toHaveLength(1);
  });
});

describe("remembering a correction", () => {
  it("keeps one category per merchant, with the newest correction winning", async () => {
    const { db, household } = await freshDb();
    open = db;

    await rememberMerchant(db, household, "ZEPHYR TRADING CO", "other-discretionary");
    await rememberMerchant(db, household, "ZEPHYR TRADING CO", "food-groceries");

    const rules = await listUserRules(db, household);
    expect(rules).toHaveLength(1);
    expect(rules[0].categoryId).toBe("food-groceries");
  });

  it("applies a correction to the merchant's untagged history", async () => {
    // Tagging one row and leaving the rest wrong turns a correction into a chore.
    const { db, household } = await freshDb();
    open = db;
    await insertTransactions(db, household, [
      txn({
        merchantKey: "ZEPHYR TRADING",
        categoryId: null,
        needsReview: true,
        sourceFingerprint: "z1",
      }),
      txn({
        merchantKey: "ZEPHYR TRADING",
        categoryId: null,
        needsReview: true,
        sourceFingerprint: "z2",
      }),
      txn({ merchantKey: "COLES", categoryId: null, needsReview: true, sourceFingerprint: "c1" }),
    ]);

    const updated = await applyToMerchantHistory(db, household, "ZEPHYR TRADING", "food-groceries");

    expect(updated).toBe(2);
    expect(await listTransactions(db, household, { needsReview: true })).toHaveLength(1);
  });
});

describe("category settings", () => {
  it("stores a cadence a whole number of months cannot express", async () => {
    const { db, household } = await freshDb();
    open = db;

    await setCategorySettings(db, household, "utilities-water", {
      cadence: { unit: "month", count: 2 },
      targetMonthly: 95,
    });
    await setCategorySettings(db, household, "income-salary", {
      cadence: { unit: "week", count: 2 },
    });

    const all = await listCategories(db, household);
    expect(all.find((c) => c.id === "utilities-water")).toMatchObject({
      cadence: { unit: "month", count: 2 },
      targetMonthly: 95,
    });
    expect(all.find((c) => c.id === "income-salary")?.cadence).toEqual({ unit: "week", count: 2 });
  });

  it("moves transactions across when two categories are merged", async () => {
    const { db, household } = await freshDb();
    open = db;
    await insertTransactions(db, household, [txn({ categoryId: "food-dining" })]);

    const moved = await mergeCategories(db, household, "food-dining", "food-groceries");

    expect(moved).toBe(1);
    const [row] = await listTransactions(db, household);
    expect(row.categoryId).toBe("food-groceries");
    // Archived, not deleted, so history keeps its name.
    expect(
      (await listCategories(db, household)).find((c) => c.id === "food-dining")?.archived,
    ).toBe(true);
  });
});

describe("household scoping", () => {
  it("never lets one household see another's rows", async () => {
    const { db, household } = await freshDb();
    open = db;
    const other = await createHousehold(db, "Someone Else");
    await seedCategories(db, other);

    await insertTransactions(db, household, [txn()]);
    await insertTransactions(db, other, [txn()]);

    expect(await listTransactions(db, household)).toHaveLength(1);
    expect(await listTransactions(db, other)).toHaveLength(1);
  });

  it("lets both households remember the same merchant differently", async () => {
    // The merchant index is scoped to a household; unscoped, the second
    // household's correction would overwrite the first's.
    const { db, household } = await freshDb();
    open = db;
    const other = await createHousehold(db, "Someone Else");
    await seedCategories(db, other);

    await rememberMerchant(db, household, "COLES", "food-groceries");
    await rememberMerchant(db, other, "COLES", "other-discretionary");

    expect((await listUserRules(db, household))[0].categoryId).toBe("food-groceries");
    expect((await listUserRules(db, other))[0].categoryId).toBe("other-discretionary");
  });
});

describe("the currency guard", () => {
  it("rejects a currency the aggregates cannot add up yet", async () => {
    // Until conversion exists, ₩500,000 + A$3,000 would report 503,000 of
    // nothing. The database refuses rather than trusting the UI.
    const { db, household } = await freshDb();
    open = db;

    await expect(insertTransactions(db, household, [txn({ currency: "KRW" })])).rejects.toThrow(
      /currency/i,
    );
  });
});

describe("tagging", () => {
  it("clears the review flag, and setting no category restores it", async () => {
    const { db, household } = await freshDb();
    open = db;
    await insertTransactions(db, household, [txn({ categoryId: null, needsReview: true })]);
    const [row] = await listTransactions(db, household);

    await categoriseTransaction(db, household, row.id, { categoryId: "food-groceries" });
    expect((await listTransactions(db, household))[0].needsReview).toBe(false);

    await categoriseTransaction(db, household, row.id, { categoryId: null });
    expect((await listTransactions(db, household))[0].needsReview).toBe(true);
  });
});
