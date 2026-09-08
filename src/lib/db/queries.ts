import "server-only";
import type { Txn } from "../aggregate";
import { CATEGORIES, type Category } from "../categories";
import type { Rule, RuleMatchType, RuleSource } from "../rules";
import type { SavingsPlan } from "../savings";
import { db } from "./client";

export type StoredCategory = Category & {
  targetMonthly: number | null;
  confirmedMonthlyRate: number | null;
  archived: boolean;
};

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function listCategories(): Promise<StoredCategory[]> {
  const rows = await db()`
    select id, name, "group", kind, one_off, cadence_months, target_monthly, confirmed_monthly_rate, archived
    from categories where archived = false order by "group", name`;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    group: r.group as Category["group"],
    kind: r.kind as Category["kind"],
    oneOff: r.one_off as boolean,
    cadenceMonths: Number(r.cadence_months),
    targetMonthly: numOrNull(r.target_monthly),
    confirmedMonthlyRate: numOrNull(r.confirmed_monthly_rate),
    archived: r.archived as boolean,
  }));
}

export async function upsertCategory(c: Partial<StoredCategory> & { id: string; name: string; group: Category["group"] }) {
  await db()`
    insert into categories (id, name, "group", kind, one_off, cadence_months, target_monthly, confirmed_monthly_rate)
    values (${c.id}, ${c.name}, ${c.group}, ${c.kind ?? "expense"}, ${c.oneOff ?? false},
            ${c.cadenceMonths ?? 1}, ${c.targetMonthly ?? null}, ${c.confirmedMonthlyRate ?? null})
    on conflict (id) do update set
      name = excluded.name,
      "group" = excluded."group",
      kind = excluded.kind,
      one_off = excluded.one_off,
      cadence_months = excluded.cadence_months,
      target_monthly = excluded.target_monthly,
      confirmed_monthly_rate = excluded.confirmed_monthly_rate`;
}

export async function setCategorySettings(
  id: string,
  patch: { targetMonthly?: number | null; confirmedMonthlyRate?: number | null; cadenceMonths?: number; oneOff?: boolean },
) {
  const sql = db();
  if (patch.targetMonthly !== undefined) {
    await sql`update categories set target_monthly = ${patch.targetMonthly} where id = ${id}`;
  }
  if (patch.confirmedMonthlyRate !== undefined) {
    await sql`update categories set confirmed_monthly_rate = ${patch.confirmedMonthlyRate} where id = ${id}`;
  }
  if (patch.cadenceMonths !== undefined) {
    await sql`update categories set cadence_months = ${patch.cadenceMonths} where id = ${id}`;
  }
  if (patch.oneOff !== undefined) {
    await sql`update categories set one_off = ${patch.oneOff} where id = ${id}`;
  }
}

export async function listUserRules(): Promise<Rule[]> {
  const rows = await db()`
    select id, pattern, category_id, match_type, source, priority
    from rules where source = 'user' order by priority desc`;
  return rows.map((r) => ({
    id: r.id as string,
    pattern: r.pattern as string,
    categoryId: r.category_id as string,
    matchType: r.match_type as RuleMatchType,
    source: r.source as RuleSource,
    priority: Number(r.priority),
  }));
}

export async function saveRule(rule: Rule) {
  await db()`
    insert into rules (id, pattern, category_id, match_type, source, priority)
    values (${rule.id}, ${rule.pattern}, ${rule.categoryId}, ${rule.matchType}, ${rule.source}, ${rule.priority})
    on conflict (id) do update set
      pattern = excluded.pattern,
      category_id = excluded.category_id,
      priority = excluded.priority`;
}

/** Remembering a correction: one merchant key maps to one category, latest wins. */
export async function rememberMerchant(pattern: string, categoryId: string) {
  if (!pattern) return;
  await db()`
    insert into rules (id, pattern, category_id, match_type, source, priority)
    values (${`user-${pattern.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}, ${pattern}, ${categoryId}, 'merchant', 'user', 100)
    on conflict (pattern) where match_type = 'merchant'
    do update set category_id = excluded.category_id`;
}

export async function deleteRule(id: string) {
  await db()`delete from rules where id = ${id} and source = 'user'`;
}

function toTxn(r: Record<string, unknown>): Txn {
  const date = r.txn_date instanceof Date ? r.txn_date.toISOString().slice(0, 10) : String(r.txn_date).slice(0, 10);
  return {
    id: String(r.id),
    date,
    month: String(r.month),
    description: String(r.description),
    amount: num(r.amount),
    categoryId: (r.category_id as string | null) ?? null,
    oneOffOverride: (r.one_off_override as boolean | null) ?? null,
    needsReview: Boolean(r.needs_review),
    isSplitParent: Boolean(r.is_split_parent),
  };
}

export type TxnRow = Txn & { merchantKey: string; balance: number | null; splitParentId: string | null };

function toTxnRow(r: Record<string, unknown>): TxnRow {
  return {
    ...toTxn(r),
    merchantKey: String(r.merchant_key ?? ""),
    balance: numOrNull(r.balance),
    splitParentId: (r.split_parent_id as string | null) ?? null,
  };
}

export async function listTransactions(): Promise<Txn[]> {
  const rows = await db()`
    select id, txn_date, month, description, amount, category_id, one_off_override, needs_review, is_split_parent
    from transactions order by txn_date, id`;
  return rows.map(toTxn);
}

export async function listTransactionsForMonth(month: string): Promise<TxnRow[]> {
  const rows = await db()`
    select id, txn_date, month, description, merchant_key, amount, balance, category_id,
           one_off_override, needs_review, is_split_parent, split_parent_id
    from transactions where month = ${month} order by txn_date, id`;
  return rows.map(toTxnRow);
}

export async function listNeedsReview(limit = 200): Promise<TxnRow[]> {
  const rows = await db()`
    select id, txn_date, month, description, merchant_key, amount, balance, category_id,
           one_off_override, needs_review, is_split_parent, split_parent_id
    from transactions
    where needs_review = true and is_split_parent = false
    order by txn_date desc limit ${limit}`;
  return rows.map(toTxnRow);
}

export type InsertableTransaction = {
  date: string;
  month: string;
  description: string;
  merchantKey: string;
  amount: number;
  balance: number | null;
  categoryId: string | null;
  oneOffOverride: boolean | null;
  needsReview: boolean;
  fingerprint: string;
};

/** Returns how many rows were new; duplicates are silently ignored. */
export async function insertTransactions(rows: InsertableTransaction[]): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await db()`
    insert into transactions ${db()(
      rows.map((r) => ({
        txn_date: r.date,
        month: r.month,
        description: r.description,
        merchant_key: r.merchantKey,
        amount: r.amount,
        balance: r.balance,
        category_id: r.categoryId,
        one_off_override: r.oneOffOverride,
        needs_review: r.needsReview,
        fingerprint: r.fingerprint,
      })),
      "txn_date", "month", "description", "merchant_key", "amount", "balance",
      "category_id", "one_off_override", "needs_review", "fingerprint",
    )}
    on conflict do nothing
    returning id`;
  return inserted.length;
}

export async function categoriseTransaction(
  id: string,
  patch: { categoryId: string | null; oneOffOverride?: boolean | null },
) {
  await db()`
    update transactions set
      category_id = ${patch.categoryId},
      one_off_override = ${patch.oneOffOverride ?? null},
      needs_review = ${patch.categoryId === null}
    where id = ${id}`;
}

/**
 * Split one transaction into several categorised parts — the bundled first
 * bill case (install fee + first month of a subscription). The parent stays
 * for provenance but stops counting.
 */
export async function splitTransaction(
  id: string,
  parts: { amount: number; categoryId: string; oneOffOverride: boolean | null }[],
) {
  const sql = db();
  await sql.begin(async (tx) => {
    const [parent] = await tx`
      select id, txn_date, month, description, merchant_key, amount, fingerprint
      from transactions where id = ${id} for update`;
    if (!parent) throw new Error("Transaction not found");

    const total = parts.reduce((acc, p) => acc + Math.round(p.amount * 100), 0);
    if (total !== Math.round(Number(parent.amount) * 100)) {
      throw new Error("Split parts must add up to the original amount");
    }

    await tx`delete from transactions where split_parent_id = ${id}`;
    for (const [i, part] of parts.entries()) {
      await tx`
        insert into transactions
          (txn_date, month, description, merchant_key, amount, category_id, one_off_override,
           needs_review, split_parent_id, fingerprint)
        values (${parent.txn_date}, ${parent.month}, ${parent.description}, ${parent.merchant_key},
                ${part.amount}, ${part.categoryId}, ${part.oneOffOverride},
                false, ${id}, ${`${parent.fingerprint}#${i + 1}`})`;
    }
    await tx`update transactions set is_split_parent = true, needs_review = false where id = ${id}`;
  });
}

export async function unsplitTransaction(id: string) {
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`delete from transactions where split_parent_id = ${id}`;
    await tx`update transactions set is_split_parent = false, needs_review = category_id is null where id = ${id}`;
  });
}

export async function deleteTransaction(id: string) {
  await db()`delete from transactions where id = ${id}`;
}

function toPlan(r: Record<string, unknown>): SavingsPlan {
  return {
    id: String(r.id),
    name: String(r.name),
    monthlyAmount: num(r.monthly_amount),
    annualRate: num(r.annual_rate),
    startingBalance: num(r.starting_balance),
    goalAmount: num(r.goal_amount),
    goalYears: Number(r.goal_years),
    active: Boolean(r.active),
  };
}

export async function listPlans(): Promise<SavingsPlan[]> {
  const rows = await db()`select * from savings_plans order by monthly_amount`;
  return rows.map(toPlan);
}

export async function activePlan(): Promise<SavingsPlan | null> {
  const rows = await db()`select * from savings_plans where active limit 1`;
  return rows.length ? toPlan(rows[0]) : null;
}

export async function savePlan(plan: Omit<SavingsPlan, "id" | "active"> & { id?: string }) {
  if (plan.id) {
    await db()`
      update savings_plans set name = ${plan.name}, monthly_amount = ${plan.monthlyAmount},
        annual_rate = ${plan.annualRate}, starting_balance = ${plan.startingBalance},
        goal_amount = ${plan.goalAmount}, goal_years = ${plan.goalYears}
      where id = ${plan.id}`;
    return plan.id;
  }
  const [row] = await db()`
    insert into savings_plans (name, monthly_amount, annual_rate, starting_balance, goal_amount, goal_years)
    values (${plan.name}, ${plan.monthlyAmount}, ${plan.annualRate}, ${plan.startingBalance},
            ${plan.goalAmount}, ${plan.goalYears})
    returning id`;
  return String(row.id);
}

export async function setActivePlan(id: string) {
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`update savings_plans set active = false where active`;
    await tx`update savings_plans set active = true where id = ${id}`;
  });
}

export async function deletePlan(id: string) {
  await db()`delete from savings_plans where id = ${id}`;
}

export async function recordUpload(parsed: number, inserted: number, skipped: number) {
  await db()`insert into uploads (parsed_count, inserted_count, skipped_count) values (${parsed}, ${inserted}, ${skipped})`;
}

/** Idempotent seed of the taxonomy shipped with the app. */
export async function seedCategories() {
  for (const c of CATEGORIES) {
    await db()`
      insert into categories (id, name, "group", kind, one_off, cadence_months)
      values (${c.id}, ${c.name}, ${c.group}, ${c.kind}, ${c.oneOff}, ${c.cadenceMonths})
      on conflict (id) do nothing`;
  }
}
