"use client";

import { useState } from "react";
import { formatAUD } from "@/lib/money";

export type RankedBar = { id: string; label: string; value: number; detail?: string };

/**
 * One hue, because these bars are a magnitude and not an identity: the
 * category is written next to each one. A twelve-colour key would be twelve
 * colours the reader has to hold in their head to learn nothing the label
 * does not already say.
 */
export function RankedBars({
  rows,
  caption,
  note,
  total,
  shareOf,
}: {
  rows: RankedBar[];
  caption: string;
  note?: string;
  total?: number;
  /** What the percentage is a share of, named so it is not "of it". */
  shareOf: string;
}) {
  const [at, setAt] = useState<string | null>(null);
  if (rows.length === 0) return null;
  const biggest = Math.max(...rows.map((r) => r.value), 1);
  const sum = total ?? rows.reduce((s, r) => s + r.value, 0);

  return (
    <figure className="mb-8">
      <figcaption className="eyebrow mb-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <span>{caption}</span>
        <span className="text-faint flex-none normal-case">share of {shareOf}</span>
      </figcaption>
      <ul className="border-rule bg-sunk space-y-2 rounded-lg border p-3">
        {rows.map((r) => {
          const share = sum > 0 ? (r.value / sum) * 100 : 0;
          return (
            <li
              key={r.id}
              onPointerEnter={() => setAt(r.id)}
              onPointerLeave={() => setAt(null)}
              onFocus={() => setAt(r.id)}
              onBlur={() => setAt(null)}
              tabIndex={0}
              className="rounded-md px-1 py-0.5"
              style={{ background: at === r.id ? "var(--track)" : undefined }}
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="flex-none">
                  <span className="tabular">{formatAUD(r.value)}</span>
                  <span className="text-faint tabular ml-2 text-xs">{share.toFixed(0)}%</span>
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="bg-track relative h-2 flex-1 rounded-sm">
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[4px]"
                    style={{
                      width: `${((r.value / biggest) * 100).toFixed(1)}%`,
                      background: "var(--accent)",
                    }}
                  />
                </span>
                {r.detail && (
                  <span className="text-faint w-32 flex-none text-right text-xs">
                    {at === r.id ? r.detail : ""}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {note && <figcaption className="text-muted mt-2 max-w-prose text-xs">{note}</figcaption>}
    </figure>
  );
}
