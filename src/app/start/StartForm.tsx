"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { Field } from "@/components/AuthShell";

type Mode = { endpoint: string; token?: string; askHousehold: boolean; verb: string };

export function AccountForm({ endpoint, token, askHousehold, verb }: Mode) {
  const router = useRouter();
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    householdName: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, token }),
    });

    if (response.ok) {
      router.replace("/");
      router.refresh();
      return;
    }

    const body = await response.json().catch(() => ({}));
    setError(body.error ?? "Something went wrong.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Your name" value={form.displayName} autoFocus onChange={set("displayName")} />
      <Field
        label="Email"
        type="email"
        value={form.email}
        autoComplete="username"
        onChange={set("email")}
      />
      <Field
        label="Password"
        type="password"
        value={form.password}
        autoComplete="new-password"
        onChange={set("password")}
      />
      <p className="text-faint text-left text-xs">
        At least 10 characters. Length is what makes a password hard to guess — a long phrase beats
        a short scramble.
      </p>
      {askHousehold && (
        <Field
          label="Household name"
          value={form.householdName}
          placeholder="Ours"
          onChange={set("householdName")}
        />
      )}
      <Button fullWidth type="submit" disabled={busy || !form.email || form.password.length < 10}>
        {busy ? "Creating…" : verb}
      </Button>
      {error && (
        <p className="text-sm" style={{ color: "var(--fail)" }} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
