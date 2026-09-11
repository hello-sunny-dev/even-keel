import type { Txn, TxnKind } from "../aggregate";
import type { Cadence } from "../cadence";
import { CATEGORIES, type Category } from "../categories";
import type { Goal, SavingsScenario } from "../goals";
import type { Account, Balance } from "../networth";
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

export type HouseholdSettings = {
  id: string;
  name: string;
  displayCurrency: string;
  locale: string;
  /**
   * Whose "today" the app means. Every default month and every "this month"
   * comes from here rather than from the server clock — at 07:00 on the first
   * of October in Perth, a UTC server is still in September.
   */
  timeZone: string;
};

export async function householdSettings(db: Db, household: string): Promise<HouseholdSettings> {
  const rows = await db.query<Record<string, unknown>>(
    `select id::text, name, display_currency, locale, time_zone
       from households where id = $1`,
    [household],
  );
  const r = rows[0];
  return {
    id: String(r.id),
    name: String(r.name),
    displayCurrency: String(r.display_currency),
    locale: String(r.locale),
    timeZone: String(r.time_zone),
  };
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
    kind: r.kind as Txn["kind"],
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
  opts: {
    month?: string;
    search?: string;
    needsReview?: boolean;
    limit?: number;
    /**
     * The ledger asks for `transaction` only. A hand-entered month total is a
     * real figure that belongs in every sum, but it is not a line on a
     * statement and listing it among them invites someone to look for the
     * receipt.
     */
    granularity?: "transaction" | "month";
  } = {},
): Promise<TxnRow[]> {
  const where = ["household_id = $1", "deleted_at is null"];
  const params: unknown[] = [household];

  if (opts.month) where.push(`month = $${params.push(opts.month)}`);
  if (opts.granularity) where.push(`granularity = $${params.push(opts.granularity)}`);
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
  patch: { categoryId: string | null; oneOffOverride?: boolean | null; kind?: TxnKind },
): Promise<void> {
  // A transfer is the one answer that is complete without a category: it is
  // not spending and not income, so there is nothing left to ask about it.
  const kind = patch.kind ?? null;
  await db.query(
    // $3 is cast because it also appears bare in `is null`, where Postgres
    // has nothing else to infer a type from.
    `update transactions
        set category_id = $3::text,
            one_off_override = $4::boolean,
            kind = coalesce($5::text, kind),
            needs_review = $3::text is null and coalesce($5::text, kind) <> 'transfer'
      where household_id = $1 and id = $2`,
    [household, id, patch.categoryId, patch.oneOffOverride ?? null, kind],
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
    // Split parents are excluded here and in the count below. A parent has no
    // category by design — its children carry them — so it looks untagged to
    // any query that only asks about `category_id`, which made the offer to
    // fix a merchant's history say "2 others" when there was one.
    `update transactions
        set category_id = $3, needs_review = false
      where household_id = $1 and merchant_key = $2 and deleted_at is null
        and not is_split_parent${condition}
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
      where household_id = $1 and merchant_key = $2 and category_id is null
        and deleted_at is null and not is_split_parent`,
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

/* ------------------------------------------------------ goals and scenarios */

export async function listGoals(db: Db, household: string): Promise<Goal[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select id::text, kind, name,
            target_amount::float8 as target_amount,
            target_months,
            opening_balance::float8 as opening_balance,
            annual_rate::float8 as annual_rate,
            start_month
       from goals
      where household_id = $1 and active
      order by kind`,
    [household],
  );

  return rows.map((r) => ({
    id: String(r.id),
    kind: r.kind as Goal["kind"],
    name: String(r.name),
    targetAmount: Number(r.target_amount),
    targetMonths: Number(r.target_months),
    openingBalance: Number(r.opening_balance),
    annualRate: Number(r.annual_rate),
    startMonth: String(r.start_month),
  }));
}

/**
 * One active goal per kind, replaced rather than versioned.
 *
 * Editing a goal is not history worth keeping — moving the target from
 * $80,000 to $90,000 means the old one was wrong, not that it happened. The
 * previous row is deactivated rather than deleted so a mistaken edit can still
 * be read out of the database.
 */
export async function saveGoal(db: Db, household: string, goal: Omit<Goal, "id">): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.query(`update goals set active = false where household_id = $1 and kind = $2`, [
      household,
      goal.kind,
    ]);
    const rows = await tx.query<{ id: string }>(
      `insert into goals
         (household_id, kind, name, target_amount, target_months,
          opening_balance, annual_rate, start_month, active)
       values ($1, $2, $3, $4, $5, $6, $7, $8, true)
       returning id::text`,
      [
        household,
        goal.kind,
        goal.name,
        goal.targetAmount,
        goal.targetMonths,
        goal.openingBalance,
        goal.annualRate,
        goal.startMonth,
      ],
    );
    return rows[0].id;
  });
}

export async function listSavingsPlans(db: Db, household: string): Promise<SavingsScenario[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select id::text, name, monthly_amount::float8 as monthly_amount, note, active
       from savings_plans
      where household_id = $1
      order by monthly_amount`,
    [household],
  );

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    monthlyAmount: Number(r.monthly_amount),
    note: (r.note as string | null) ?? null,
    active: Boolean(r.active),
  }));
}

/**
 * Replace the whole ladder in one go.
 *
 * Every month is scored against all three scenarios, so they are edited as a
 * set rather than one at a time. `active` decides only which one supplies the
 * headline verdict, and the unique index allows exactly one.
 */
export async function saveSavingsPlans(
  db: Db,
  household: string,
  plans: { name: string; monthlyAmount: number; note?: string | null; active: boolean }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(`delete from savings_plans where household_id = $1`, [household]);
    for (const plan of plans) {
      await tx.query(
        `insert into savings_plans (household_id, name, monthly_amount, note, active)
         values ($1, $2, $3, $4, $5)`,
        [household, plan.name, plan.monthlyAmount, plan.note ?? null, plan.active],
      );
    }
  });
}

/* ------------------------------------------------- accounts and balances */

export async function listAccounts(db: Db, household: string): Promise<Account[]> {
  const rows = await db.query<Record<string, unknown>>(
    // Assets first and the debt last, in the order someone would read them
    // out: what is reachable, then what is not, then what is owed. Ordering by
    // the kind's name instead puts the mortgage between the ETFs and the
    // house, which is alphabetical and meaningless.
    `select id::text, name, kind, bucket, currency, archived
       from accounts
      where household_id = $1
      order by archived,
               case kind
                 when 'cash' then 1
                 when 'investment' then 2
                 when 'super' then 3
                 when 'property' then 4
                 when 'loan' then 5
               end,
               name`,
    [household],
  );

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    kind: r.kind as Account["kind"],
    bucket: r.bucket as Account["bucket"],
    currency: String(r.currency),
    archived: Boolean(r.archived),
  }));
}

// Not `createAccount`: `auth-server.ts` already has one of those for a person.
// A route that needed both would have to rename one at the import, and the two
// meanings of "account" in a finance app are worth keeping apart by name.
export async function addAccount(
  db: Db,
  household: string,
  account: { name: string; kind: Account["kind"]; bucket: Account["bucket"]; currency?: string },
): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `insert into accounts (household_id, name, kind, bucket, currency)
     values ($1, $2, $3, $4, $5) returning id::text`,
    [household, account.name, account.kind, account.bucket, account.currency ?? "AUD"],
  );
  return rows[0].id;
}

/** Archived, never deleted: the balances it carries are the history. */
export async function archiveAccount(db: Db, household: string, id: string): Promise<void> {
  await db.query(`update accounts set archived = true where household_id = $1 and id = $2`, [
    household,
    id,
  ]);
}

export async function listBalances(db: Db, household: string): Promise<Balance[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select b.account_id::text as account_id, b.month,
            b.amount::float8 as amount,
            b.contributed::float8 as contributed
       from balances b
       join accounts a on a.id = b.account_id
      where a.household_id = $1
      order by b.month`,
    [household],
  );

  return rows.map((r) => ({
    accountId: String(r.account_id),
    month: String(r.month),
    amount: Number(r.amount),
    contributed: Number(r.contributed),
  }));
}

/**
 * One figure per account per month, replaced when it is entered again.
 *
 * Scoped through the account's household in the same statement rather than
 * checked first: a balance carries no household of its own, and a separate
 * check is a race and an easy thing to forget at the next call site.
 */
export async function setBalance(db: Db, household: string, balance: Balance): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `insert into balances (account_id, month, amount, contributed)
     select a.id, $3, $4, $5 from accounts a
      where a.id = $2 and a.household_id = $1
     on conflict (account_id, month)
       do update set amount = excluded.amount, contributed = excluded.contributed
     returning id::text`,
    [household, balance.accountId, balance.month, balance.amount, balance.contributed],
  );
  return rows.length > 0;
}

/* ------------------------------------------------------------ manual entry */

/**
 * The categories this household has actually used, most-used first.
 *
 * A month form listing all fifty seed categories is a form nobody fills in.
 * The ones with history are the ones this household has, and the rest stay one
 * click away.
 */
export async function categoriesWithHistory(db: Db, household: string): Promise<string[]> {
  const rows = await db.query<{ category_id: string }>(
    `select category_id, count(*)::int as n
       from transactions
      where household_id = $1 and deleted_at is null and category_id is not null
      group by category_id
      order by n desc`,
    [household],
  );
  return rows.map((r) => r.category_id);
}

export type MonthTotal = { categoryId: string; amount: number };

export async function monthTotals(db: Db, household: string, month: string): Promise<MonthTotal[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select category_id, amount::float8 as amount
       from transactions
      where household_id = $1 and month = $2
        and granularity = 'month' and deleted_at is null
      order by category_id`,
    [household, month],
  );
  return rows.map((r) => ({ categoryId: String(r.category_id), amount: Number(r.amount) }));
}

/**
 * Replace a month's hand-entered totals.
 *
 * Entering a month again is a correction, not a second month, so the previous
 * set is soft-deleted first rather than merged. Soft, because the fingerprint
 * index ignores deleted rows and a hard delete would lose the trail of what
 * the figure used to be.
 *
 * Only month-granularity rows are touched. A month can hold both an imported
 * statement and hand-entered totals for the categories the statement never
 * saw, and replacing one must not disturb the other.
 */
export async function replaceMonthTotals(
  db: Db,
  household: string,
  month: string,
  rows: InsertableTransaction[],
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.query(
      `update transactions set deleted_at = now()
        where household_id = $1 and month = $2
          and granularity = 'month' and deleted_at is null`,
      [household, month],
    );
    return rows.length === 0 ? 0 : insertTransactions(tx, household, rows);
  });
}
