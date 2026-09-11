"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Note } from "@/components/ui";
import { describeCadence, type Cadence, type CadenceUnit } from "@/lib/cadence";
import type { Category } from "@/lib/categories";
import type { StoredCategory } from "@/lib/db/queries";

const RHYTHMS: { label: string; cadence: Cadence }[] = [
  { label: "Weekly", cadence: { unit: "week", count: 1 } },
  { label: "Fortnightly", cadence: { unit: "week", count: 2 } },
  { label: "Monthly", cadence: { unit: "month", count: 1 } },
  { label: "Every 2 months", cadence: { unit: "month", count: 2 } },
  { label: "Quarterly", cadence: { unit: "month", count: 3 } },
  { label: "Every 6 months", cadence: { unit: "month", count: 6 } },
  { label: "Annually", cadence: { unit: "month", count: 12 } },
];

const GROUPS: Category["group"][] = [
  "Mortgage",
  "Insurance",
  "Utilities",
  "Subscriptions",
  "Food",
  "Transport",
  "Medical",
  "Personal",
  "Pet",
  "Other",
  "One-off",
  "Income",
];

/**
 * The flag does the same job either way — hold this out of the trailing
 * average — but "recurring average" is the wrong name for it on the income
 * side, where what it keeps a tax refund out of is core income.
 */
function oneOffLabel(kind: Category["kind"]): string {
  return kind === "income"
    ? "One-off — keep it out of core income"
    : "One-off — keep it out of recurring averages";
}

function keyOf(cadence: Cadence): string {
  return `${cadence.unit}:${cadence.count}`;
}

function fromKey(key: string): Cadence {
  const [unit, count] = key.split(":");
  return { unit: unit as CadenceUnit, count: Number(count) };
}

async function post(body: unknown): Promise<{ ok: boolean; error?: string; moved?: number }> {
  const response = await fetch("/api/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));
  return { ok: response.ok, error: parsed.error, moved: parsed.moved };
}

const field = "border-rule-strong bg-sheet rounded-lg border px-3 py-2 text-sm";

export function CategorySettings({ categories }: { categories: StoredCategory[] }) {
  const [open, setOpen] = useState(false);
  const live = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);

  const groups = GROUPS.map((group) => ({
    group,
    rows: live.filter((c) => c.group === group),
  })).filter((g) => g.rows.length > 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="border-rule-strong flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm"
      >
        <span>
          {live.length} categories
          {archived.length > 0 && `, ${archived.length} archived`}
        </span>
        <span className="text-muted">{open ? "Hide" : "Edit"}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            className="overflow-hidden"
          >
            <div className="pt-4">
              <NewCategory />

              {groups.map(({ group, rows }) => (
                <section key={group} className="mt-6">
                  <p className="eyebrow mb-2">{group}</p>
                  <ul className="space-y-2">
                    {rows.map((c) => (
                      <CategoryRow key={c.id} category={c} all={live} />
                    ))}
                  </ul>
                </section>
              ))}

              {archived.length > 0 && (
                <section className="mt-8">
                  <p className="eyebrow mb-2">Archived</p>
                  <p className="text-muted mb-3 max-w-prose text-xs">
                    Still readable, so transactions that were filed here keep their name. Restoring
                    one does not bring back the transactions a merge moved out of it.
                  </p>
                  <ul className="space-y-2">
                    {archived.map((c) => (
                      <ArchivedRow key={c.id} category={c} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CategoryRow({ category, all }: { category: StoredCategory; all: StoredCategory[] }) {
  const router = useRouter();
  const [name, setName] = useState(category.name);
  const [oneOff, setOneOff] = useState(category.oneOff);
  const [cadence, setCadence] = useState(keyOf(category.cadence));
  const [target, setTarget] = useState(
    category.targetMonthly === null ? "" : String(category.targetMonthly),
  );
  const [mergeInto, setMergeInto] = useState("");
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty =
    name !== category.name ||
    oneOff !== category.oneOff ||
    cadence !== keyOf(category.cadence) ||
    target !== (category.targetMonthly === null ? "" : String(category.targetMonthly));

  async function save() {
    setBusy(true);
    setMessage(null);
    const amount = target.trim() === "" ? null : Number(target);
    const result = await post({
      settings: {
        id: category.id,
        name,
        oneOff,
        cadence: fromKey(cadence),
        targetMonthly: amount,
      },
    });
    setBusy(false);
    if (!result.ok) return setMessage({ text: result.error ?? "Failed.", bad: true });
    router.refresh();
  }

  async function merge() {
    setBusy(true);
    setMessage(null);
    const result = await post({ merge: { from: category.id, into: mergeInto } });
    setBusy(false);
    if (!result.ok) return setMessage({ text: result.error ?? "Failed.", bad: true });
    setMessage({
      text:
        result.moved === 0
          ? "Merged. There was nothing filed under it."
          : `Merged, and ${result.moved} transaction${result.moved === 1 ? "" : "s"} moved across.`,
      bad: false,
    });
    router.refresh();
  }

  async function archive() {
    setBusy(true);
    const result = await post({ settings: { id: category.id, archived: true } });
    setBusy(false);
    if (!result.ok) return setMessage({ text: result.error ?? "Failed.", bad: true });
    router.refresh();
  }

  return (
    <li className="border-rule bg-sheet rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[9rem] flex-1">
          <span className="sr-only">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${field} w-full`}
            aria-label={`Name of ${category.name}`}
          />
        </label>

        <label className="min-w-[8rem]">
          <span className="sr-only">How often it bills</span>
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            className={field}
            aria-label={`How often ${category.name} bills`}
          >
            {RHYTHMS.map((r) => (
              <option key={keyOf(r.cadence)} value={keyOf(r.cadence)}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <label className="w-28">
          <span className="sr-only">Target a month</span>
          <input
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Target"
            className={`${field} tabular w-full`}
            aria-label={`Monthly target for ${category.name}`}
          />
        </label>

        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty || !name.trim()}
          className="bg-ink text-paper disabled:bg-track disabled:text-muted rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>

      <div className="text-muted mt-2 flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={oneOff} onChange={(e) => setOneOff(e.target.checked)} />
          {oneOffLabel(category.kind)}
        </label>
        <span aria-hidden>·</span>
        <span>bills {describeCadence(fromKey(cadence))}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="min-w-[10rem] flex-1">
          <span className="sr-only">Merge into</span>
          <select
            value={mergeInto}
            onChange={(e) => setMergeInto(e.target.value)}
            className={`${field} w-full`}
            aria-label={`Merge ${category.name} into another category`}
          >
            <option value="">Merge into…</option>
            {all
              .filter((c) => c.id !== category.id && c.kind === category.kind)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          onClick={merge}
          disabled={busy || !mergeInto}
          className="border-rule-strong text-muted rounded-lg border px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Merge
        </button>
        <button
          type="button"
          onClick={archive}
          disabled={busy}
          className="border-rule-strong text-muted rounded-lg border px-3 py-2 text-xs"
        >
          Archive
        </button>
      </div>

      {message && (
        <p
          className="mt-2 text-xs"
          role="status"
          style={{ color: message.bad ? "var(--fail)" : "var(--muted)" }}
        >
          {message.text}
        </p>
      )}
    </li>
  );
}

function ArchivedRow({ category }: { category: StoredCategory }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function restore() {
    setBusy(true);
    await post({ settings: { id: category.id, archived: false } });
    setBusy(false);
    router.refresh();
  }

  return (
    <li className="border-rule bg-sunk flex items-center justify-between rounded-lg border p-3">
      <span className="text-muted text-sm">
        {category.name} <span className="text-faint text-xs">· {category.group}</span>
      </span>
      <button
        type="button"
        onClick={restore}
        disabled={busy}
        className="border-rule-strong rounded-lg border px-3 py-1.5 text-xs"
      >
        Restore
      </button>
    </li>
  );
}

function NewCategory() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [group, setGroup] = useState<Category["group"]>("Other");
  const [kind, setKind] = useState<Category["kind"]>("expense");
  const [oneOff, setOneOff] = useState(false);
  const [cadence, setCadence] = useState("month:1");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await post({
      create: { name, group, kind, oneOff, cadence: fromKey(cadence) },
    });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Failed.");
    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border-rule bg-sunk rounded-lg border p-3">
      <p className="eyebrow mb-2">Add a category</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[9rem] flex-1">
          <span className="sr-only">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What to call it"
            className={`${field} w-full`}
          />
        </label>
        <label className="min-w-[7rem]">
          <span className="sr-only">Group</span>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as Category["group"])}
            className={field}
            aria-label="Group"
          >
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[7rem]">
          <span className="sr-only">Money in or out</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Category["kind"])}
            className={field}
            aria-label="Money in or out"
          >
            <option value="expense">Money out</option>
            <option value="income">Money in</option>
          </select>
        </label>
        <label className="min-w-[8rem]">
          <span className="sr-only">How often it bills</span>
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            className={field}
            aria-label="How often it bills"
          >
            {RHYTHMS.map((r) => (
              <option key={keyOf(r.cadence)} value={keyOf(r.cadence)}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="bg-ink text-paper disabled:bg-track disabled:text-muted rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      <label className="text-muted mt-2 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={oneOff} onChange={(e) => setOneOff(e.target.checked)} />
        {oneOffLabel(kind)}
      </label>
      {error && (
        <p className="mt-2 text-xs" role="alert" style={{ color: "var(--fail)" }}>
          {error}
        </p>
      )}
    </form>
  );
}

export function CategoryNote() {
  return (
    <Note>
      One-off is a flag on the category, not a word in its name. Changing it here moves every total
      that depends on it — which is the whole reason the spreadsheet could not do this.
    </Note>
  );
}
