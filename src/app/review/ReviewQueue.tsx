"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Money } from "@/components/ui";
import type { StoredCategory } from "@/lib/db/queries";
import type { TxnRow } from "@/lib/db/queries";

type Row = TxnRow & { siblings: number };

async function post(body: unknown): Promise<{ ok: boolean; error?: string; applied?: number }> {
  const response = await fetch("/api/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));
  return { ok: response.ok, error: parsed.error, applied: parsed.applied };
}

export function ReviewQueue({ rows, categories }: { rows: Row[]; categories: StoredCategory[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <ReviewRow key={row.id} row={row} categories={categories} />
      ))}
    </ul>
  );
}

function ReviewRow({ row, categories }: { row: Row; categories: StoredCategory[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [oneOff, setOneOff] = useState<boolean | null>(null);
  // Defaults to yes. Tagging one row and leaving its history wrong turns a
  // correction into a chore, and the chore is what stops people tagging.
  const [applyToHistory, setApplyToHistory] = useState(true);
  const [remember, setRemember] = useState(true);
  const [splitting, setSplitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const chosen = categories.find((c) => c.id === categoryId);

  async function tag(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await post({
      tag: {
        id: row.id,
        categoryId,
        oneOff: oneOff ?? undefined,
        merchantKey: row.merchantKey,
        applyToHistory,
        remember,
      },
    });
    setBusy(false);
    if (!result.ok) return setMessage({ text: result.error ?? "Failed.", bad: true });
    router.refresh();
  }

  // Neither spending nor income, so it takes no category: the answer is that
  // there is nothing to count here.
  async function markTransfer() {
    setBusy(true);
    setMessage(null);
    const result = await post({ tag: { id: row.id, categoryId: null, transfer: true } });
    setBusy(false);
    if (!result.ok) return setMessage({ text: result.error ?? "Failed.", bad: true });
    router.refresh();
  }

  return (
    <li className="border-rule bg-sheet rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">{row.description}</p>
          <p className="tabular text-faint text-xs">{row.date} · nothing matched</p>
        </div>
        <p className="text-lg font-semibold">
          <Money amount={row.amount} cents />
        </p>
      </div>

      {splitting ? (
        <SplitForm
          row={row}
          categories={categories}
          onDone={() => {
            setSplitting(false);
            router.refresh();
          }}
          onCancel={() => setSplitting(false)}
        />
      ) : (
        <form onSubmit={tag} className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="border-rule-strong bg-paper min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || !categoryId}
              className="bg-ink text-paper disabled:bg-track disabled:text-muted rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed"
            >
              {busy ? "Tagging…" : "Tag"}
            </button>
            <button
              type="button"
              onClick={() => setSplitting(true)}
              className="border-rule-strong rounded-lg border px-3 py-2 text-sm"
            >
              Split
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={markTransfer}
              title="Money moved between our own accounts — not spending, not income"
              className="border-rule-strong rounded-lg border px-3 py-2 text-sm"
            >
              Transfer
            </button>
          </div>

          {categoryId && (
            <div className="text-muted space-y-1 text-xs">
              {row.siblings > 0 && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={applyToHistory}
                    onChange={(e) => setApplyToHistory(e.target.checked)}
                  />
                  Apply to {row.siblings} other untagged{" "}
                  {row.siblings === 1 ? "transaction" : "transactions"} from{" "}
                  {row.merchantKey || "this merchant"}
                </label>
              )}
              {row.merchantKey && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Remember it, so future statements tag themselves
                </label>
              )}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={oneOff ?? chosen?.oneOff ?? false}
                  onChange={(e) => setOneOff(e.target.checked)}
                />
                One-off — keep it out of the recurring averages
              </label>
            </div>
          )}

          {message && (
            <p
              className="text-sm"
              role="alert"
              style={{ color: message.bad ? "var(--fail)" : "var(--pass)" }}
            >
              {message.text}
            </p>
          )}
        </form>
      )}
    </li>
  );
}

function SplitForm({
  row,
  categories,
  onDone,
  onCancel,
}: {
  row: Row;
  categories: StoredCategory[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [parts, setParts] = useState([
    { amount: "", categoryId: "" },
    { amount: "", categoryId: "" },
  ]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entered = parts.reduce((sum, p) => sum + Math.round((Number(p.amount) || 0) * 100), 0);
  const target = Math.round(row.amount * 100);
  const remaining = (target - entered) / 100;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await post({
      split: {
        id: row.id,
        parts: parts.map((p) => ({ amount: Number(p.amount), categoryId: p.categoryId })),
      },
    });
    setBusy(false);
    if (!result.ok) return setMessage(result.error ?? "Failed.");
    onDone();
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <p className="text-muted text-xs">
        The bundled first bill — an install fee and the first month arriving as one charge. The
        parts have to add up to <Money amount={row.amount} cents />; the original stays for
        provenance and stops counting.
      </p>

      {parts.map((part, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            inputMode="decimal"
            value={part.amount}
            placeholder="-120.00"
            onChange={(e) =>
              setParts((ps) => ps.map((p, j) => (i === j ? { ...p, amount: e.target.value } : p)))
            }
            className="border-rule-strong bg-paper tabular w-28 rounded-lg border px-2 py-1.5 text-sm"
          />
          <select
            value={part.categoryId}
            onChange={(e) =>
              setParts((ps) =>
                ps.map((p, j) => (i === j ? { ...p, categoryId: e.target.value } : p)),
              )
            }
            className="border-rule-strong bg-paper min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm"
          >
            <option value="">Category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setParts((ps) => [...ps, { amount: "", categoryId: "" }])}
          className="text-muted text-xs underline"
        >
          Another part
        </button>
        <span
          className="text-xs"
          style={{ color: remaining === 0 ? "var(--pass)" : "var(--muted)" }}
        >
          {remaining === 0 ? (
            "adds up"
          ) : (
            <>
              still to place: <Money amount={remaining} cents />
            </>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy || remaining !== 0 || parts.some((p) => !p.categoryId)}
          className="bg-ink text-paper disabled:bg-track disabled:text-muted rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed"
        >
          {busy ? "Splitting…" : "Split it"}
        </button>
        <button type="button" onClick={onCancel} className="text-muted text-sm underline">
          Cancel
        </button>
        {message && (
          <span className="text-sm" role="alert" style={{ color: "var(--fail)" }}>
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
