import type { Txn } from "../aggregate";
import type { Cadence } from "../cadence";
import { CATEGORIES, type Category } from "../categories";
import type { Rule, RuleMatchType, RuleSource } from "../rules";
import type { Db } from "./port";

/**
 * Every query is scoped to a household and casts at the boundary, so callers
 * get numbers and date strings rather than whatever shape the driver felt like
 * returning. See `port.ts` for why both of those are the query's job.
 */

export type StoredCategory = Category & {
  targetMonthly: number | null;
  confirmedMonthlyRate: number | null;
  archived: boolean;
};

export type TxnRow = Txn & {
  merchantKey: string;
  balance: number | null;
  currency: string;
  txnKind: "income" | "expense" | "transfer";
  source: "csv" | "pdf" | "manual";
  granularity: "transaction" | "month";
  sourceFingerprint: string;
  uploadId: string | null;
  splitParentId: string | null;
};

export type InsertableTransaction = {
  date: string;
  month: string;
  description: string;
  merchantKey: string;
  amount: number;
  currency?: string;
  balance: number | null;
  kind: "income" | "expense" | "transfer";
  categoryId: string | null;
  oneOffOverride: boolean | null;
  needsReview: boolean;
  source: "csv" | "pdf" | "manual";
  granularity?: "transaction" | "month";
  sourceFingerprint: string;
};

/* ------------------------------------------------------------- households */

export async function firstHouseholdId(db: Db): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    "select id::text from households order by created_at limit 1",
  );
  return rows[0]?.id ?? null;
}

export async function createHousehold(
  db: Db,
  name: string,
  opts: { currency?: string; timeZone?: string } = {},
): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `insert into households (name, display_currency, time_zone)
     values ($1, $2, $3) returning id::text`,
    [name, opts.currency ?? "AUD", opts.timeZone ?? "Australia/Perth"],
  );
  return rows[0].id;
}

/* ------------------------------------------------------------- categories */

export async function listCategories(db: Db, household: string): Promise<StoredCategory[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select id, name, "group", kind, one_off, cadence_unit, cadence_count,
            target_monthly::float8 as target_monthly,
            confirmed_monthly_rate::float8 as confirmed_monthly_rate,
            archived
       from categories
      where household_id = $1
      order by "group", name`,
    [household],
  );

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    group: r.group as Category["group"],
    kind: r.kind as Category["kind"],
    oneOff: Boolean(r.one_off),
    cadence: {
      unit: (r.cadence_unit as Cadence["unit"]) ?? "month",
      count: Number(r.cadence_count ?? 1),
    },
    targetMonthly: r.target_monthly === null ? null : Number(r.target_monthly),
    confirmedMonthlyRate:
      r.confirmed_monthly_rate === null ? null : Number(r.confirmed_monthly_rate),
    archived: Boolean(r.archived),
  }));
}

/** Archived categories stay readable, so old rows keep their name. */
export async function categoryMap(db: Db, household: string): Promise<Map<string, Category>> {
  const all = await listCategories(db, household);
  return new Map(all.map((c) => [c.id, c]));
}

export async function seedCategories(db: Db, household: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const c of CATEGORIES) {
      await tx.query(
        `insert into categories (id, household_id, name, "group", kind, one_off, cadence_unit, cadence_count)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (household_id, id) do nothing`,
        [c.id, household, c.name, c.group, c.kind, c.oneOff, c.cadence.unit, c.cadence.count],
      );
    }
  });
}

export async function setCategorySettings(
  db: Db,
  household: string,
  id: string,
  patch: {
    targetMonthly?: number | null;
    confirmedMonthlyRate?: number | null;
    cadence?: Cadence;
    oneOff?: boolean;
    name?: string;
  },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [household, id];
  const add = (fragment: string, ...values: unknown[]) => {
    sets.push(fragment.replace(/\?/g, () => `$${params.push(values.shift())}`));
  };

  if (patch.targetMonthly !== undefined) add("target_monthly = ?", patch.targetMonthly);
  if (patch.confirmedMonthlyRate !== undefined)
    add("confirmed_monthly_rate = ?", patch.confirmedMonthlyRate);
  if (patch.cadence !== undefined)
    add("cadence_unit = ?, cadence_count = ?", patch.cadence.unit, patch.cadence.count);
  if (patch.oneOff !== undefined) add("one_off = ?", patch.oneOff);
  if (patch.name !== undefined) add("name = ?", patch.name);
  if (sets.length === 0) return;

  await db.query(
    `update categories set ${sets.join(", ")} where household_id = $1 and id = $2`,
    params,
  );
}

/**
 * Fold one category into another: move its transactions and rules across, then
 * archive it. Archiving rather than deleting keeps the name available for rows
 * that still reference it in history.
 */
export async function mergeCategories(
  db: Db,
  household: string,
  from: string,
  into: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    const moved = await tx.query<{ id: string }>(
      `update transactions set category_id = $3
        where household_id = $1 and category_id = $2 returning id::text`,
      [household, from, into],
    );
    await tx.query(
      `update rules set category_id = $3 where household_id = $1 and category_id = $2`,
      [household, from, into],
    );
    await tx.query(`update categories set archived = true where household_id = $1 and id = $2`, [
      household,
      from,
    ]);
    return moved.length;
  });
}

/* ------------------------------------------------------------------ rules */

export async function listUserRules(db: Db, household: string): Promise<Rule[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select id, pattern, category_id, match_type, source, priority::int as priority
       from rules where household_id = $1 and source = 'user' order by priority desc`,
    [household],
  );

  return rows.map((r) => ({
    id: String(r.id),
    pattern: String(r.pattern),
    categoryId: String(r.category_id),
    matchType: r.match_type as RuleMatchType,
    source: r.source as RuleSource,
    priority: Number(r.priority),
  }));
}

/** A correction, remembered by merchant. The newest one wins. */
export async function rememberMerchant(
  db: Db,
  household: string,
  pattern: string,
  categoryId: string,
): Promise<void> {
  if (!pattern) return;
  const id = `user-${pattern.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  await db.query(
    `insert into rules (id, household_id, pattern, category_id, match_type, source, priority)
     values ($1, $2, $3, $4, 'merchant', 'user', 100)
     on conflict (household_id, pattern) where match_type = 'merchant'
     do update set category_id = excluded.category_id, id = excluded.id`,
    [id, household, pattern, categoryId],
  );
}

export async function deleteRule(db: Db, household: string, id: string): Promise<void> {
  await db.query(`delete from rules where household_id = $1 and id = $2 and source = 'user'`, [
    household,
    id,
  ]);
}

/* ----------------------------------------------------------- transactions */

const TXN_COLUMNS = `
  id::text, txn_date::text as txn_date, month, description, merchant_key,
  amount::float8 as amount, currency, balance::float8 as balance, kind,
  category_id, one_off_override, needs_review, source, granularity,
  source_fingerprint, upload_id::text as upload_id,
  split_parent_id::text as split_parent_id, is_split_parent`;

function toTxnRow(r: Record<string, unknown>): TxnRow {
  return {
    id: String(r.id),
    date: String(r.txn_date),
    month: String(r.month),
    description: String(r.description),
    amount: Number(r.amount),
    categoryId: (r.category_id as string | null) ?? null,
    oneOffOverride: (r.one_off_override as boolean | null) ?? null,
    needsReview: Boolean(r.needs_review),
    isSplitParent: Boolean(r.is_split_parent),
    merchantKey: String(r.merchant_key ?? ""),
    balance: r.balance === null || r.balance === undefined ? null : Number(r.balance),
    currency: String(r.currency ?? "AUD"),
    txnKind: r.kind as TxnRow["txnKind"],
    source: r.source as TxnRow["source"],
    granularity: r.granularity as TxnRow["granularity"],
    sourceFingerprint: String(r.source_fingerprint ?? ""),
    uploadId: (r.upload_id as string | null) ?? null,
    splitParentId: (r.split_parent_id as string | null) ?? null,
  };
}

export async function listTransactions(
  db: Db,
  household: string,
  opts: { month?: string; search?: string; needsReview?: boolean; limit?: number } = {},
): Promise<TxnRow[]> {
  const where = ["household_id = $1", "deleted_at is null"];
  const params: unknown[] = [household];

  if (opts.month) where.push(`month = $${params.push(opts.month)}`);
  if (opts.needsReview) where.push("needs_review and not is_split_parent");
  if (opts.search) {
    where.push(`description ilike $${params.push(`%${opts.search}%`)}`);
  }

  const limit = opts.limit ? ` limit $${params.push(opts.limit)}` : "";
  const rows = await db.query<Record<string, unknown>>(
    `select ${TXN_COLUMNS} from transactions
      where ${where.join(" and ")}
      order by txn_date desc, id${limit}`,
    params,
  );
  return rows.map(toTxnRow);
}

/**
 * Insert a batch in one statement.
 *
 * postgres.js has an array helper for this but it does not exist through
 * `unsafe`, and one round-trip per row is slow enough to matter on a
 * two-month statement. `unnest` works identically on both drivers.
 *
 * Returns how many rows were new — duplicates collide on the fingerprint index
 * and are dropped.
 */
export async function insertTransactions(
  db: Db,
  household: string,
  rows: InsertableTransaction[],
  uploadId: string | null = null,
): Promise<number> {
  if (rows.length === 0) return 0;

  const inserted = await db.query<{ id: string }>(
    `insert into transactions
       (household_id, txn_date, month, description, merchant_key, amount, currency,
        balance, kind, category_id, one_off_override, needs_review, source,
        granularity, source_fingerprint, upload_id)
     select $1,
            d::date, m, descr, mk, amt, cur, bal, k, cat, oo, nr, src, gran, fp, $2::uuid
       from unnest(
         $3::text[],  $4::text[],  $5::text[],  $6::text[],  $7::numeric[], $8::text[],
         $9::numeric[], $10::text[], $11::text[], $12::boolean[], $13::boolean[],
         $14::text[], $15::text[], $16::text[]
       ) as t(d, m, descr, mk, amt, cur, bal, k, cat, oo, nr, src, gran, fp)
     on conflict do nothing
     returning id::text`,
    [
      household,
      uploadId,
      rows.map((r) => r.date),
      rows.map((r) => r.month),
      rows.map((r) => r.description),
      rows.map((r) => r.merchantKey),
      rows.map((r) => r.amount),
      rows.map((r) => r.currency ?? "AUD"),
      rows.map((r) => r.balance),
      rows.map((r) => r.kind),
      rows.map((r) => r.categoryId),
      rows.map((r) => r.oneOffOverride),
      rows.map((r) => r.needsReview),
      rows.map((r) => r.source),
      rows.map((r) => r.granularity ?? "transaction"),
      rows.map((r) => r.sourceFingerprint),
    ],
  );

  return inserted.length;
}

export async function categoriseTransaction(
  db: Db,
  household: string,
  id: string,
  patch: { categoryId: string | null; oneOffOverride?: boolean | null },
): Promise<void> {
  await db.query(
    // $3 is cast because it also appears bare in `is null`, where Postgres
    // has nothing else to infer a type from.
    `update transactions
        set category_id = $3::text,
            one_off_override = $4::boolean,
            needs_review = $3::text is null
      where household_id = $1 and id = $2`,
    [household, id, patch.categoryId, patch.oneOffOverride ?? null],
  );
}

/**
 * Apply a category to every untagged transaction from the same merchant.
 *
 * Tagging one row and leaving its history wrong is the difference between a
 * correction and a chore.
 */
export async function applyToMerchantHistory(
  db: Db,
  household: string,
  merchantKey: string,
  categoryId: string,
  opts: { includeTagged?: boolean } = {},
): Promise<number> {
  if (!merchantKey) return 0;
  const condition = opts.includeTagged ? "" : " and category_id is null";
  const rows = await db.query<{ id: string }>(
    `update transactions
        set category_id = $3, needs_review = false
      where household_id = $1 and merchant_key = $2 and deleted_at is null${condition}
      returning id::text`,
    [household, merchantKey, categoryId],
  );
  return rows.length;
}

export async function countMerchantHistory(
  db: Db,
  household: string,
  merchantKey: string,
): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `select count(*)::int as n from transactions
      where household_id = $1 and merchant_key = $2 and category_id is null and deleted_at is null`,
    [household, merchantKey],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Split one transaction into several categorised parts — the bundled first
 * bill, where an install fee and the first month arrive as one charge. The
 * parent stays for provenance but stops counting.
 */
export async function splitTransaction(
  db: Db,
  household: string,
  id: string,
  parts: { amount: number; categoryId: string; oneOffOverride: boolean | null }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const [parent] = await tx.query<Record<string, unknown>>(
      `select ${TXN_COLUMNS} from transactions where household_id = $1 and id = $2 for update`,
      [household, id],
    );
    if (!parent) throw new Error("Transaction not found");

    const total = parts.reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
    if (total !== Math.round(Number(parent.amount) * 100)) {
      throw new Error("Split parts must add up to the original amount");
    }

    await tx.query("delete from transactions where split_parent_id = $1", [id]);
    for (const [i, part] of parts.entries()) {
      await tx.query(
        `insert into transactions
           (household_id, txn_date, month, description, merchant_key, amount, currency,
            kind, category_id, one_off_override, needs_review, source, granularity,
            source_fingerprint, split_parent_id)
         values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, false, $11, $12, $13, $14)`,
        [
          household,
          parent.txn_date,
          parent.month,
          parent.description,
          parent.merchant_key,
          part.amount,
          parent.currency,
          part.amount > 0 ? "income" : "expense",
          part.categoryId,
          part.oneOffOverride,
          parent.source,
          parent.granularity,
          `${parent.source_fingerprint}#part${i + 1}`,
          id,
        ],
      );
    }
    await tx.query(
      "update transactions set is_split_parent = true, needs_review = false where id = $1",
      [id],
    );
  });
}

export async function unsplitTransaction(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("delete from transactions where split_parent_id = $1", [id]);
    await tx.query(
      `update transactions
          set is_split_parent = false, needs_review = category_id is null
        where id = $1`,
      [id],
    );
  });
}

/* ---------------------------------------------------------------- uploads */

export async function recordUpload(
  db: Db,
  household: string,
  counts: { kind: "csv" | "pdf" | "manual"; files: number; parsed: number; skipped: number },
): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `insert into uploads (household_id, kind, file_count, parsed_count, skipped_count)
     values ($1, $2, $3, $4, $5) returning id::text`,
    [household, counts.kind, counts.files, counts.parsed, counts.skipped],
  );
  return rows[0].id;
}

export async function finishUpload(db: Db, uploadId: string, inserted: number): Promise<void> {
  await db.query("update uploads set inserted_count = $2 where id = $1", [uploadId, inserted]);
}

/**
 * Undo a whole import.
 *
 * Soft-deleted rather than removed, so a mistaken undo is recoverable and the
 * fingerprint index stops treating the rows as present.
 */
export async function undoUpload(db: Db, household: string, uploadId: string): Promise<number> {
  const rows = await db.query<{ id: string }>(
    `update transactions set deleted_at = now()
      where household_id = $1 and upload_id = $2 and deleted_at is null
      returning id::text`,
    [household, uploadId],
  );
  return rows.length;
}
