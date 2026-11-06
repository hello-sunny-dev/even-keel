"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Money } from "@/components/ui";
import type { Account, AccountMovement, Balance } from "@/lib/networth";

const KINDS: { value: Account["kind"]; label: string; bucket: Account["bucket"] }[] = [
  { value: "cash", label: "Cash / offset", bucket: "available" },
  { value: "investment", label: "Investments", bucket: "invested" },
  { value: "super", label: "Superannuation", bucket: "locked" },
  { value: "property", label: "Property", bucket: "locked" },
  { value: "loan", label: "Loan / mortgage", bucket: "locked" },
];

async function post(body: unknown): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch("/api/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));
  return { ok: response.ok, error: parsed.error };
}

export function AddAccount() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Account["kind"]>("cash");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const bucket = KINDS.find((k) => k.value === kind)!.bucket;
    const result = await post({ account: { name, kind, bucket } });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Failed.");
    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="min-w-[10rem] flex-1">
        <span className="eyebrow">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Offset account"
          className="border-rule-strong bg-sheet mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        />
      </label>
      <label className="min-w-[10rem] flex-1">
        <span className="eyebrow">What it is</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Account["kind"])}
          className="border-rule-strong bg-sheet mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={busy || !name.trim()}>
        {busy ? "Adding…" : "Add account"}
      </Button>
      {error && (
        <span className="w-full text-sm" role="alert" style={{ color: "var(--fail)" }}>
          {error}
        </span>
      )}
    </form>
  );
}

export function AccountRow({
  account,
  latest,
  movement,
  month,
}: {
  account: Account;
  latest: Balance | null;
  movement: AccountMovement | null;
  month: string;
}) {
  const router = useRouter();
  const loan = account.kind === "loan";
  const fresh = latest?.month === month;

  // Prefilled with the figure being carried forward, so a month where nothing
  // moved — a house valuation, usually — is one click rather than retyping six
  // digits, which is where the typos come from. What was put in is not carried:
  // that is a fact about a month, not a running total.
  const [amount, setAmount] = useState(latest ? String(latest.amount) : "");
  const [contributed, setContributed] = useState(fresh ? String(latest!.contributed) : "");
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await post({
      balance: {
        accountId: account.id,
        month,
        amount: Number(amount),
        contributed: Number(contributed || 0),
      },
    });
    setBusy(false);
    if (!result.ok) return setMessage({ text: result.error ?? "Failed.", bad: true });
    setMessage({ text: "Saved.", bad: false });
    router.refresh();
  }

  return (
    <li className="border-rule border-b py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {account.name}
          <span className="text-faint ml-2 text-xs">
            {KINDS.find((k) => k.value === account.kind)?.label}
          </span>
        </span>
        <span className="text-right">
          {latest ? (
            <>
              <span className="text-base font-semibold">
                <Money amount={loan ? -latest.amount : latest.amount} />
              </span>
              {!fresh && (
                <span className="text-faint ml-2 text-xs">
                  as at {latest.month} — not this month
                </span>
              )}
            </>
          ) : (
            <span className="text-faint text-xs">no figure yet</span>
          )}
        </span>
      </div>

      {movement && (
        <p className="text-muted mt-1 text-xs">
          {movement.gain === null ? (
            <>One figure so far — nothing to compare it against yet.</>
          ) : (
            <>
              {movement.from} → {movement.to}: <Money amount={movement.contributed} />{" "}
              {loan ? "repaid" : "put in"}, <Money amount={movement.gain} signed tone />{" "}
              {loan ? "of interest" : "earned"}
            </>
          )}
        </p>
      )}

      <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
        <label className="w-32">
          <span className="eyebrow">{loan ? "Still owed" : "Worth now"}</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border-rule-strong bg-sheet tabular mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="w-32">
          <span className="eyebrow">{loan ? "Repaid" : "Put in"}</span>
          <input
            inputMode="decimal"
            value={contributed}
            onChange={(e) => setContributed(e.target.value)}
            placeholder="0"
            className="border-rule-strong bg-sheet tabular mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy || amount === ""}
          className="border-rule-strong disabled:border-rule disabled:text-faint rounded-lg border px-3 py-1.5 text-sm disabled:cursor-not-allowed"
        >
          {busy ? "Saving…" : fresh ? "Update" : latest ? "Confirm for this month" : "Save"}
        </button>
        {message && (
          <span
            className="text-xs"
            role="alert"
            style={{ color: message.bad ? "var(--fail)" : "var(--pass)" }}
          >
            {message.text}
          </span>
        )}
      </form>
    </li>
  );
}
