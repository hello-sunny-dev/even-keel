"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Money } from "@/components/ui";
import type { StoredCategory } from "@/lib/db/queries";

async function post(body: unknown): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch("/api/manual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));
  return { ok: response.ok, error: parsed.error };
}

function newKey(): string {
  return crypto.randomUUID();
}

export function OneTransaction({
  categories,
  today,
}: {
  categories: StoredCategory[];
  today: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    date: today,
    description: "",
    amount: "",
    categoryId: "",
    direction: "out" as "out" | "in" | "transfer",
  });
  // Rotated after each save, so the button being pressed twice writes one row
  // while two identical entries a minute apart both land.
  const [key, setKey] = useState(newKey);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const size = Math.abs(Number(form.amount));
    const result = await post({
      transaction: {
        clientKey: key,
        date: form.date,
        description: form.description,
        amount: form.direction === "in" ? size : -size,
        categoryId: form.categoryId || null,
        kind: form.direction === "transfer" ? "transfer" : undefined,
      },
    });
    setBusy(false);

    if (!result.ok) return setMessage({ text: result.error ?? "Failed.", bad: true });
    setKey(newKey());
    setForm((f) => ({ ...f, description: "", amount: "" }));
    setMessage({ text: "Added.", bad: false });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="max-w-lg space-y-3">
      <p className="text-muted max-w-prose text-sm">
        Cash, something split with a friend, a bill that never touched the imported account.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="eyebrow">Date</span>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className="border-rule-strong bg-sheet mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="eyebrow">Amount</span>
          <input
            inputMode="decimal"
            value={form.amount}
            placeholder="42.50"
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="border-rule-strong bg-sheet tabular mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="eyebrow">What was it</span>
        <input
          value={form.description}
          placeholder="Farmers market"
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="border-rule-strong bg-sheet mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="eyebrow">Which way</span>
          <select
            value={form.direction}
            onChange={(e) =>
              setForm((f) => ({ ...f, direction: e.target.value as typeof f.direction }))
            }
            className="border-rule-strong bg-sheet mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="out">Money out</option>
            <option value="in">Money in</option>
            <option value="transfer">Moved to an investment</option>
          </select>
        </label>
        <label>
          <span className="eyebrow">Category</span>
          <select
            value={form.categoryId}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            className="border-rule-strong bg-sheet mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">Leave for review</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !form.amount || !form.description.trim()}
          className="bg-ink text-paper disabled:bg-track disabled:text-muted rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed"
        >
          {busy ? "Adding…" : "Add transaction"}
        </button>
        {message && (
          <span
            className="text-sm"
            role="alert"
            style={{ color: message.bad ? "var(--fail)" : "var(--pass)" }}
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}

export function WholeMonth({
  categories,
  used,
  month,
  existing,
  previous,
}: {
  categories: StoredCategory[];
  /** Categories with history, in the order this household uses them. */
  used: string[];
  month: string;
  existing: { categoryId: string; amount: number }[];
  previous: { categoryId: string; amount: number }[];
}) {
  const router = useRouter();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const previousById = new Map(previous.map((p) => [p.categoryId, Math.abs(p.amount)]));

  // Shown: everything already entered for this month, everything entered last
  // month, then the categories with history. A list of every seed category is
  // a form nobody finishes.
  const shown = [
    ...new Set([
      ...existing.map((e) => e.categoryId),
      ...previous.map((p) => p.categoryId),
      ...used,
    ]),
  ].filter((id) => byId.has(id));

  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(existing.map((e) => [e.categoryId, String(Math.abs(e.amount))])),
  );
  const [extra, setExtra] = useState<string[]>([]);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = [...shown, ...extra];
  const unlisted = categories.filter((c) => !rows.includes(c.id));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const result = await post({
      month,
      rows: rows
        .filter((id) => amounts[id] && Number(amounts[id]) !== 0)
        .map((id) => ({ categoryId: id, amount: Number(amounts[id]) })),
    });
    setBusy(false);

    if (!result.ok) return setMessage({ text: result.error ?? "Failed.", bad: true });
    setMessage({ text: "Month saved.", bad: false });
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted max-w-prose text-sm">
        Nothing has been categorised yet, so there is no shortlist to fill in. Import a statement
        first, or add a transaction by hand — after that this becomes the fastest way to enter a
        month.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-3">
      <p className="text-muted max-w-prose text-sm">
        One figure per category for the whole month, for when there is no statement to import. These
        count in every total and chart, and stay out of the ledger — they are not lines anybody can
        look up.
      </p>

      <ul className="border-rule-strong border-t">
        {rows.map((id) => {
          const category = byId.get(id)!;
          const last = previousById.get(id);
          return (
            <li key={id} className="border-rule flex items-center gap-3 border-b py-2">
              <span className="flex-1 text-sm">
                {category.name}
                {last !== undefined && (
                  <button
                    type="button"
                    onClick={() => setAmounts((a) => ({ ...a, [id]: String(last) }))}
                    className="text-faint ml-2 text-xs underline"
                  >
                    same as last month (<Money amount={last} />)
                  </button>
                )}
              </span>
              <input
                inputMode="decimal"
                value={amounts[id] ?? ""}
                placeholder="0"
                onChange={(e) => setAmounts((a) => ({ ...a, [id]: e.target.value }))}
                className="border-rule-strong bg-sheet tabular w-28 rounded-lg border px-2 py-1.5 text-right text-sm"
              />
            </li>
          );
        })}
      </ul>

      {unlisted.length > 0 && (
        <label className="block">
          <span className="eyebrow">Something else</span>
          <select
            value=""
            onChange={(e) => e.target.value && setExtra((x) => [...x, e.target.value])}
            className="border-rule-strong bg-sheet mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">Add a category…</option>
            {unlisted.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="bg-ink text-paper disabled:bg-track disabled:text-muted rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed"
        >
          {busy ? "Saving…" : existing.length > 0 ? "Update the month" : "Save the month"}
        </button>
        {message && (
          <span
            className="text-sm"
            role="alert"
            style={{ color: message.bad ? "var(--fail)" : "var(--pass)" }}
          >
            {message.text}
          </span>
        )}
      </div>

      {existing.length > 0 && (
        <p className="text-faint text-xs">
          Saving replaces what is already entered for this month rather than adding to it.
        </p>
      )}
    </form>
  );
}
