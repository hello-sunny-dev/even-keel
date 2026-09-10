"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/AuthShell";
import type { Invite } from "@/lib/auth-server";

export function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) return setMessage({ text: body.error ?? "Failed.", bad: true });
    setForm({ currentPassword: "", newPassword: "" });
    setMessage({ text: body.message ?? "Password changed.", bad: false });
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-3">
      <Field
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={form.currentPassword}
        onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
      />
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        value={form.newPassword}
        onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
      />
      <button
        type="submit"
        disabled={busy || !form.currentPassword || form.newPassword.length < 10}
        className="bg-ink text-paper disabled:bg-track disabled:text-muted rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed"
      >
        {busy ? "Changing…" : "Change password"}
      </button>
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
  );
}

export function Invites({ initial, origin }: { initial: Invite[]; origin: string }) {
  const router = useRouter();
  const [invites, setInvites] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function create(kind: "join" | "new_household") {
    setBusy(true);
    const response = await fetch("/api/auth/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) setInvites((current) => [body.invite, ...current]);
    router.refresh();
  }

  async function revoke(token: string) {
    setInvites((current) => current.filter((i) => i.token !== token));
    await fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => create("join")}
          className="bg-ink text-paper disabled:bg-track disabled:text-muted rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed"
        >
          Invite into this household
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => create("new_household")}
          className="border-rule-strong disabled:border-rule disabled:text-faint rounded-lg border px-4 py-2 text-sm disabled:cursor-not-allowed"
        >
          Invite someone to start their own
        </button>
      </div>

      {invites.length === 0 ? (
        <p className="text-muted text-sm">No open invites.</p>
      ) : (
        <ul className="space-y-2">
          {invites.map((invite) => {
            const link = `${origin}/join?token=${invite.token}`;
            return (
              <li key={invite.token} className="border-rule bg-sunk rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {invite.kind === "join"
                    ? "Joins this household — shares everything"
                    : "Starts a separate household — shares nothing"}
                </p>
                <p className="tabular text-muted mt-1 text-xs break-all">{link}</p>
                <div className="mt-2 flex gap-3 text-xs">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      navigator.clipboard?.writeText(link);
                      setCopied(invite.token);
                    }}
                  >
                    {copied === invite.token ? "Copied" : "Copy link"}
                  </button>
                  <button type="button" className="underline" onClick={() => revoke(invite.token)}>
                    Revoke
                  </button>
                  <span className="text-faint">expires {invite.expiresAt.slice(0, 10)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
