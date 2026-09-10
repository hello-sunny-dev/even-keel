"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      router.replace(next);
      router.refresh();
      return;
    }

    const body = await response.json().catch(() => ({}));
    setError(body.error ?? "Something went wrong.");
    // Leave what was typed in place. Clearing it means retyping the whole
    // thing to fix one character.
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        aria-label="Password"
        autoFocus
        autoComplete="current-password"
        className="border-rule-strong bg-sheet w-full rounded-lg border px-3 py-2 text-center tracking-[0.3em]"
      />
      <button
        type="submit"
        disabled={busy || password.length === 0}
        className="bg-ink text-paper w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
      >
        {busy ? "Checking…" : "Unlock"}
      </button>
      {error && (
        <p className="text-center text-sm" style={{ color: "var(--fail)" }} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
