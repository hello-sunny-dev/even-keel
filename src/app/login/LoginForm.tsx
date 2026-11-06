"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { Field } from "@/components/AuthShell";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      router.replace(next);
      router.refresh();
      return;
    }

    const body = await response.json().catch(() => ({}));
    // What was typed stays: a typo should cost one character, not the lot.
    setError(body.error ?? "Something went wrong.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field
        label="Email"
        type="email"
        value={email}
        autoFocus
        autoComplete="username"
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="Password"
        type="password"
        value={password}
        autoComplete="current-password"
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button fullWidth type="submit" disabled={busy || !email || !password}>
        {busy ? "Checking…" : "Sign in"}
      </Button>
      {error && (
        <p className="text-sm" style={{ color: "var(--fail)" }} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
