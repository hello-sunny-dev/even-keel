"use client";

import { useId, useState } from "react";
import { formatAUD } from "@/lib/money";
import { formatMonth } from "@/lib/months";

/**
 * Two series at most, and never two y-axes.
 *
 * Income and spending are both dollars, so they share one scale and can be
 * compared by eye. A second axis would let any two shapes be made to cross
 * wherever the drawing happened to put them.
 *
 * Teal against amber measures ΔE 11.1 for protanopia in light mode and 9.3 in
 * dark, against a bar of 8 — unlike the green/red pass-fail pair elsewhere,
 * which is why that one is carried by geometry instead. The legend and the
 * end-labels are still here: colour is never the only way to tell them apart.
 */

const PAD = { top: 10, right: 14, bottom: 22, left: 64 };
const W = 640;
const H = 220;

export type Series = { name: string; colour: string; values: number[] };

/**
 * Axis ticks are compact — "$20k", not "$20,000".
 *
 * The gutter they sit in is a share of the chart's width, so on a phone it is
 * about 35px. A spelled-out five-figure amount does not fit and runs over the
 * plot, which is worse than a reader doing one division in their head.
 */
function tick(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return "$0";
  if (abs >= 1000) return `$${Number((value / 1000).toFixed(abs >= 10000 ? 0 : 1))}k`;
  return formatAUD(value);
}

function niceTop(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= max) return candidate;
  }
  return 10 * magnitude;
}

function ticksFor(top: number, bottom: number): number[] {
  const span = top - bottom;
  const step = niceTop(span / 4);
  const out: number[] = [];
  for (let v = Math.ceil(bottom / step) * step; v <= top + 1e-9; v += step) {
    out.push(Number(v.toFixed(2)));
  }
  return out;
}

function useHover(count: number) {
  const [at, setAt] = useState<number | null>(null);

  function fromPointer(event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * W;
    const inner = W - PAD.left - PAD.right;
    const ratio = count > 1 ? (x - PAD.left) / inner : 0;
    setAt(Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1)))));
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setAt((prev) => {
      const next = (prev ?? 0) + (event.key === "ArrowRight" ? 1 : -1);
      return Math.max(0, Math.min(count - 1, next));
    });
  }

  return { at, setAt, fromPointer, onKeyDown };
}

function Readout({
  month,
  rows,
  index,
  count,
}: {
  month: string;
  rows: { name: string; colour: string; value: number }[];
  index: number;
  count: number;
}) {
  // Flipped to the left once past halfway, so the card never leaves the card
  // it is drawn inside.
  const past = count > 1 ? index / (count - 1) : 0;
  return (
    <div
      className="border-rule bg-sheet pointer-events-none absolute top-2 z-10 rounded-lg border px-3 py-2 shadow-sm"
      style={past > 0.5 ? { left: "0.75rem" } : { right: "0.75rem" }}
      role="status"
    >
      <p className="text-faint text-xs">{formatMonth(month, { long: true })}</p>
      {rows.map((r) => (
        <p key={r.name} className="mt-1 flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className="h-0.5 w-3 flex-none rounded-full"
            style={{ background: r.colour }}
          />
          <span className="tabular font-medium">{formatAUD(r.value)}</span>
          <span className="text-muted text-xs">{r.name}</span>
        </p>
      ))}
    </div>
  );
}

export function LineChart({
  months,
  series,
  caption,
  note,
  zeroLine,
}: {
  months: string[];
  series: Series[];
  caption: string;
  note?: string;
  zeroLine?: boolean;
}) {
  const labelId = useId();
  const { at, setAt, fromPointer, onKeyDown } = useHover(months.length);
  if (months.length === 0) return null;

  const all = series.flatMap((s) => s.values);
  const top = niceTop(Math.max(...all, 0));
  const bottom = Math.min(...all, 0) < 0 ? -niceTop(Math.abs(Math.min(...all))) : 0;
  const span = top - bottom || 1;

  const inner = W - PAD.left - PAD.right;
  const x = (i: number) => PAD.left + (months.length > 1 ? (i / (months.length - 1)) * inner : 0);
  const y = (v: number) => PAD.top + ((top - v) / span) * (H - PAD.top - PAD.bottom);

  const ticks = ticksFor(top, bottom);
  // Enough month labels to orient, never so many that they touch.
  const every = Math.max(1, Math.ceil(months.length / 6));
  const shown = at ?? months.length - 1;

  return (
    <figure className="mb-8">
      <figcaption id={labelId} className="eyebrow mb-2">
        {caption}
      </figcaption>

      <div className="border-rule bg-sunk relative rounded-lg border p-3">
        <ul className="text-muted mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-0.5 w-4 flex-none rounded-full"
                style={{ background: s.colour }}
              />
              {s.name}
            </li>
          ))}
        </ul>

        {at !== null && (
          <Readout
            month={months[at]}
            index={at}
            count={months.length}
            rows={series.map((s) => ({ name: s.name, colour: s.colour, value: s.values[at] }))}
          />
        )}

        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {ticks.map((t) => (
              <span
                key={t}
                className="text-faint tabular absolute -translate-y-1/2 pr-2 text-right text-[11px] leading-none"
                style={{ top: `${(y(t) / H) * 100}%`, left: 0, width: `${(PAD.left / W) * 100}%` }}
              >
                {tick(t)}
              </span>
            ))}
            {months.map((m, i) =>
              i % every === 0 || i === months.length - 1 ? (
                <span
                  key={m}
                  className="text-faint absolute bottom-0 text-[11px] leading-none whitespace-nowrap"
                  style={{
                    left: `${(x(i) / W) * 100}%`,
                    transform:
                      i === months.length - 1
                        ? "translateX(-100%)"
                        : i === 0
                          ? "none"
                          : "translateX(-50%)",
                  }}
                >
                  {formatMonth(m)}
                </span>
              ) : null,
            )}
          </div>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full touch-none"
            role="img"
            aria-labelledby={labelId}
            tabIndex={0}
            onPointerMove={fromPointer}
            onPointerLeave={() => setAt(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setAt(null)}
          >
            {ticks.map((t) => (
              <line
                key={t}
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--rule)"
                strokeWidth={1}
              />
            ))}

            {zeroLine && bottom < 0 && (
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(0)}
                y2={y(0)}
                stroke="var(--rule-strong)"
                strokeWidth={1}
              />
            )}

            {at !== null && (
              <line
                x1={x(at)}
                x2={x(at)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--rule-strong)"
                strokeWidth={1}
              />
            )}

            {series.map((s) => (
              <g key={s.name}>
                <polyline
                  points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                  fill="none"
                  stroke={s.colour}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle
                  cx={x(s.values.length - 1)}
                  cy={y(s.values[s.values.length - 1])}
                  r={4}
                  fill={s.colour}
                  stroke="var(--sunk)"
                  strokeWidth={2}
                />
                {at !== null && (
                  <circle
                    cx={x(at)}
                    cy={y(s.values[at])}
                    r={4}
                    fill={s.colour}
                    stroke="var(--sunk)"
                    strokeWidth={2}
                  />
                )}
              </g>
            ))}
          </svg>
        </div>

        <p className="text-faint mt-1 text-xs">
          {series.map((s) => `${s.name} ${formatAUD(s.values[shown])}`).join(" · ")} in{" "}
          {formatMonth(months[shown], { long: true })}
        </p>
      </div>

      {note && <figcaption className="text-muted mt-2 max-w-prose text-xs">{note}</figcaption>}

      <details className="mt-2">
        <summary className="text-muted cursor-pointer text-xs">Show as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="eyebrow border-rule-strong border-b text-left">
                <th className="pb-2">Month</th>
                {series.map((s) => (
                  <th key={s.name} className="pb-2 text-right">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={m} className="border-rule border-b">
                  <td className="py-1.5">{formatMonth(m, { long: true })}</td>
                  {series.map((s) => (
                    <td key={s.name} className="tabular py-1.5 text-right">
                      {formatAUD(s.values[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

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
