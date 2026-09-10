"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/AuthShell";
import { Money } from "@/components/ui";
import { goalProgress, suggestScenarios, type Goal, type SavingsScenario } from "@/lib/goals";

type Draft = {
  name: string;
  targetAmount: string;
  targetMonths: string;
  openingBalance: string;
  annualRate: string;
  startMonth: string;
};

function toDraft(goal: Goal | undefined, fallback: { name: string; startMonth: string }): Draft {
  return {
    name: goal?.name ?? fallback.name,
    targetAmount: goal ? String(goal.targetAmount) : "",
    targetMonths: goal ? String(goal.targetMonths) : "60",
    openingBalance: goal ? String(goal.openingBalance) : "0",
    // Shown as a percentage, stored as a fraction. Nobody types 0.045.
    annualRate: goal ? String(goal.annualRate * 100) : "0",
    startMonth: goal?.startMonth ?? fallback.startMonth,
  };
}

function parsed(draft: Draft, kind: "cash" | "net_worth") {
  return {
    kind,
    name: draft.name,
    targetAmount: Number(draft.targetAmount),
    targetMonths: Number(draft.targetMonths),
    openingBalance: Number(draft.openingBalance),
    annualRate: Number(draft.annualRate) / 100,
    startMonth: draft.startMonth,
  };
}

export function GoalForm({
  kind,
  goal,
  thisMonth,
  lede,
}: {
  kind: "cash" | "net_worth";
  goal: Goal | undefined;
  thisMonth: string;
  lede: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(
    toDraft(goal, { name: kind === "cash" ? "Savings" : "Net worth", startMonth: thisMonth }),
  );
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const candidate = parsed(draft, kind);
  const usable =
    candidate.targetAmount > 0 &&
    candidate.targetMonths >= 1 &&
    /^\d{4}-\d{2}$/.test(draft.startMonth);
  // What it costs a month, updated as the numbers are typed — the point of the
  // form is this figure, not the target.
  const monthly = usable
    ? goalProgress({ id: "preview", ...candidate }, candidate.openingBalance, draft.startMonth)
        .plannedMonthly
    : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const response = await fetch("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: candidate }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) return setMessage({ text: body.error ?? "Failed.", bad: true });
    setMessage({ text: "Saved.", bad: false });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-muted max-w-prose text-sm">{lede}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Reach"
          inputMode="decimal"
          placeholder="60000"
          value={draft.targetAmount}
          onChange={(e) => setDraft((d) => ({ ...d, targetAmount: e.target.value }))}
        />
        <Field
          label="Within (months)"
          inputMode="numeric"
          value={draft.targetMonths}
          onChange={(e) => setDraft((d) => ({ ...d, targetMonths: e.target.value }))}
        />
        <Field
          label="Starting from"
          type="month"
          value={draft.startMonth}
          onChange={(e) => setDraft((d) => ({ ...d, startMonth: e.target.value }))}
        />
        <Field
          label="Already there"
          inputMode="decimal"
          value={draft.openingBalance}
          onChange={(e) => setDraft((d) => ({ ...d, openingBalance: e.target.value }))}
        />
        <Field
          label="Growth, % a year"
          inputMode="decimal"
          value={draft.annualRate}
          onChange={(e) => setDraft((d) => ({ ...d, annualRate: e.target.value }))}
        />
      </div>

      {monthly !== null && (
        <p className="text-sm">
          That is <Money amount={monthly} cents /> a month.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !usable}
          className="bg-ink text-paper rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {busy ? "Saving…" : goal ? "Update goal" : "Set goal"}
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

export function ScenarioLadder({
  scenarios,
  cashGoal,
}: {
  scenarios: SavingsScenario[];
  cashGoal: Goal | undefined;
}) {
  const router = useRouter();
  const suggested = cashGoal ? suggestScenarios(cashGoal) : [];
  const [rows, setRows] = useState(
    scenarios.length > 0
      ? scenarios.map((s) => ({
          name: s.name,
          monthlyAmount: String(s.monthlyAmount),
          active: s.active,
        }))
      : suggested.map((s, i) => ({
          name: s.name,
          monthlyAmount: String(s.monthlyAmount),
          active: i === 0,
        })),
  );
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const response = await fetch("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarios: rows.map((r) => ({
          name: r.name,
          monthlyAmount: Number(r.monthlyAmount),
          active: r.active,
        })),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) return setMessage({ text: body.error ?? "Failed.", bad: true });
    setMessage({ text: "Saved.", bad: false });
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted text-sm">
        Set the savings goal first — the ladder is built from it.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <ul className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className="flex flex-wrap items-end gap-3">
            <label className="flex-1">
              <span className="eyebrow">Name</span>
              <input
                value={row.name}
                onChange={(e) =>
                  setRows((rs) => rs.map((r, j) => (i === j ? { ...r, name: e.target.value } : r)))
                }
                className="border-rule-strong bg-sheet mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </label>
            <label className="flex-1">
              <span className="eyebrow">A month</span>
              <input
                inputMode="decimal"
                value={row.monthlyAmount}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, j) => (i === j ? { ...r, monthlyAmount: e.target.value } : r)),
                  )
                }
                className="border-rule-strong bg-sheet tabular mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="radio"
                name="active-scenario"
                checked={row.active}
                onChange={() => setRows((rs) => rs.map((r, j) => ({ ...r, active: i === j })))}
              />
              Ours
            </label>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="bg-ink text-paper rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save scenarios"}
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
