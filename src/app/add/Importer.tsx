"use client";

import { useState } from "react";
import type { Category } from "@/lib/categories";
import type { FileReport, ProposedTransaction } from "@/lib/ingest";
import { formatAUD } from "@/lib/money";

type Result = { report: FileReport; rows: ProposedTransaction[] };

export function Importer({ categories }: { categories: Category[] }) {
  const [rows, setRows] = useState<ProposedTransaction[]>([]);
  const [reports, setReports] = useState<FileReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null);

  const keeping = rows.filter((r) => r.include && !r.duplicate);
  const untagged = keeping.filter((r) => !r.categoryId).length;

  async function read(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    setDone(null);

    const collected: ProposedTransaction[] = [];
    const collectedReports: FileReport[] = [];

    // One request per file: the body limit is per request, and a failure part
    // way through should not lose the files that already parsed.
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/import", { method: "POST", body });
      if (!response.ok) {
        const { error: message } = await response.json().catch(() => ({ error: "Upload failed." }));
        setError(`${file.name}: ${message}`);
        continue;
      }
      const result = (await response.json()) as Result;
      collectedReports.push(result.report);
      collected.push(...result.rows);
    }

    const seen = new Set<string>();
    setRows(
      collected.map((row) => {
        if (seen.has(row.sourceFingerprint)) return { ...row, duplicate: true, include: false };
        seen.add(row.sourceFingerprint);
        return row;
      }),
    );
    setReports(collectedReports);
    setBusy(false);
  }

  function update(fingerprint: string, patch: Partial<ProposedTransaction>) {
    setRows((current) =>
      current.map((row) => (row.sourceFingerprint === fingerprint ? { ...row, ...patch } : row)),
    );
  }

  async function commit() {
    setBusy(true);
    const response = await fetch("/api/import", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: keeping, reports }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error ?? "Import failed.");
    setDone(result);
    setRows([]);
    setReports([]);
  }

  return (
    <div className="space-y-5">
      <label className="border-rule-strong bg-sunk block cursor-pointer rounded-xl border border-dashed p-8 text-center">
        <input
          type="file"
          accept="application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => read(e.target.files)}
        />
        <span className="block text-base font-semibold">Choose statement PDFs</span>
        <span className="text-muted mt-1 block text-sm">
          Several at once. Parsed in memory and discarded — only the extracted fields are stored.
        </span>
      </label>

      {busy && <p className="text-muted text-sm">Reading…</p>}
      {error && (
        <p
          className="border-rule bg-sunk rounded-lg border p-3 text-sm"
          style={{ color: "var(--fail)" }}
        >
          {error}
        </p>
      )}

      {done && (
        <p className="border-rule bg-sunk rounded-lg border p-3 text-sm">
          Imported <strong>{done.inserted}</strong>
          {done.skipped > 0 && <> · skipped {done.skipped} already present</>}.
        </p>
      )}

      {reports.map((report) => (
        <div key={report.name} className="border-rule bg-sunk rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{report.name}</span>
            <span className="tabular text-muted">{report.transactions} transactions</span>
          </div>
          <p
            className="mt-1 text-xs"
            style={{ color: report.drift === 0 ? "var(--pass)" : "var(--fail)" }}
          >
            {report.drift === null
              ? "No opening or closing balance found — the totals cannot be checked."
              : report.drift === 0
                ? "Balances reconcile — every transaction is accounted for."
                : `Off by ${formatAUD(report.drift, { cents: true })} — rows were dropped or misread.`}
          </p>
          {report.warnings.map((w) => (
            <p key={w} className="mt-1 text-xs" style={{ color: "var(--oneoff)" }}>
              {w}
            </p>
          ))}
        </div>
      ))}

      {rows.length > 0 && (
        <>
          <div className="border-rule bg-sunk flex flex-wrap items-baseline gap-3 rounded-lg border px-4 py-3">
            <span className="tabular text-xl font-semibold">{keeping.length}</span>
            <span className="text-muted text-sm">will import</span>
            {rows.length - keeping.length > 0 && (
              <span className="text-faint text-sm">{rows.length - keeping.length} skipped</span>
            )}
            {untagged > 0 && (
              <span className="text-sm" style={{ color: "var(--oneoff)" }}>
                {untagged} untagged
              </span>
            )}
            <span className="text-faint ml-auto text-xs">
              Nothing is saved until you press Import
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="eyebrow border-rule-strong border-b text-left">
                  <th className="pr-3 pb-2">Keep</th>
                  <th className="pr-3 pb-2">Date</th>
                  <th className="pr-3 pb-2">Description</th>
                  <th className="pr-3 pb-2">Category</th>
                  <th className="pr-3 pb-2">One-off</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.sourceFingerprint}
                    className="border-rule border-b"
                    style={{ opacity: row.include && !row.duplicate ? 1 : 0.45 }}
                  >
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={row.include && !row.duplicate}
                        disabled={row.duplicate}
                        onChange={(e) =>
                          update(row.sourceFingerprint, { include: e.target.checked })
                        }
                      />
                    </td>
                    <td className="tabular text-muted py-2 pr-3 whitespace-nowrap">{row.date}</td>
                    <td className="py-2 pr-3">
                      {row.description}
                      {row.duplicate && (
                        <span className="text-faint ml-2 rounded border border-current px-1 text-[10px]">
                          already imported
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={row.categoryId ?? ""}
                        onChange={(e) =>
                          update(row.sourceFingerprint, { categoryId: e.target.value || null })
                        }
                        className="border-rule-strong bg-sheet rounded border px-2 py-1 text-xs"
                      >
                        <option value="">needs tagging</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.group} — {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <input
                        type="checkbox"
                        checked={row.oneOff}
                        onChange={(e) =>
                          update(row.sourceFingerprint, { oneOff: e.target.checked })
                        }
                      />
                    </td>
                    <td className="py-2 text-right">
                      <input
                        value={row.amount}
                        onChange={(e) =>
                          update(row.sourceFingerprint, { amount: Number(e.target.value) || 0 })
                        }
                        className="tabular border-rule-strong bg-sheet w-24 rounded border px-2 py-1 text-right text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={commit}
            disabled={busy || keeping.length === 0}
            className="bg-ink text-paper rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Import {keeping.length} transactions
          </button>
        </>
      )}
    </div>
  );
}
