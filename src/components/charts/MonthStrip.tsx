import Link from "next/link";
import { formatAUD } from "@/lib/money";
import { formatMonth } from "@/lib/months";

/**
 * Why nothing here is told apart by colour alone.
 *
 * Cleared and short are green and red, and green against red is the pair
 * dichromatic vision cannot separate: measured against this palette it is
 * ΔE 7.3 for deuteranopia in light mode and 5.1 in dark, where 8 is the bar.
 * Saturating the green makes it worse, not better. So the colour is
 * reinforcement and the geometry is the signal — every bar is read against a
 * line drawn at what the month had to clear, which also says by how much.
 */

export type MonthBar = {
  month: string;
  saved: number;
  required: number;
};

export function MonthStrip({
  months,
  selected,
  href,
}: {
  months: MonthBar[];
  selected: string;
  href: (month: string) => string;
}) {
  if (months.length === 0) return null;

  const required = months[0]?.required ?? 0;
  // One scale for bars and for the line, so their heights are comparable. A
  // month can be negative — spending more than came in — and the axis has to
  // hold that rather than clip it.
  const top = Math.max(required, ...months.map((m) => m.saved), 1);
  const bottom = Math.min(0, ...months.map((m) => m.saved));
  const span = top - bottom || 1;
  const zero = ((top - 0) / span) * 100;
  const line = required > 0 ? ((top - required) / span) * 100 : null;

  return (
    <figure className="mb-8">
      <figcaption className="eyebrow mb-2 flex items-baseline justify-between">
        <span>Saved each month</span>
        {required > 0 && (
          <span className="normal-case">line at {formatAUD(required)} — the plan</span>
        )}
      </figcaption>

      <div className="border-rule bg-sunk relative rounded-lg border p-3">
        <div className="relative flex h-28 items-stretch gap-[2px]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-0"
            style={{ top: `${zero}%`, borderTop: "1px solid var(--rule)" }}
          />

          {months.map((m) => {
            const cleared = m.saved >= m.required;
            const height = (Math.abs(m.saved) / span) * 100;
            const isSelected = m.month === selected;
            const short = Math.round(m.required - m.saved);

            return (
              <Link
                key={m.month}
                href={href(m.month)}
                aria-current={isSelected ? "true" : undefined}
                title={`${formatMonth(m.month, { long: true })} — saved ${formatAUD(m.saved)}${
                  m.required > 0
                    ? cleared
                      ? ", cleared the plan"
                      : `, short by ${formatAUD(short)}`
                    : ""
                }`}
                className="group relative z-20 max-w-[64px] min-w-0 flex-1 rounded-sm"
                style={{ background: isSelected ? "var(--track)" : undefined }}
              >
                <span
                  className="absolute inset-x-[2px] rounded-t-[3px]"
                  style={{
                    background: cleared ? "var(--pass)" : "var(--fail)",
                    height: `${Math.max(height, 1.5)}%`,
                    ...(m.saved >= 0
                      ? { top: `calc(${zero}% - ${Math.max(height, 1.5)}%)` }
                      : { top: `${zero}%`, borderRadius: "0 0 3px 3px" }),
                  }}
                />
              </Link>
            );
          })}

          {/*
            Above the bars, not behind them. The line is what makes the strip
            readable without colour: a bar ending under it is short, and by how
            much. Hidden behind the fills it stops being an encoding at all.
          */}
          {line !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 z-30 border-t border-dashed"
              style={{ top: `${line}%`, borderColor: "var(--ink)", opacity: 0.55 }}
            />
          )}
        </div>

        <div className="text-faint mt-2 flex gap-[2px] text-[0.6rem]">
          {months.map((m) => (
            <span
              key={m.month}
              className="max-w-[64px] min-w-0 flex-1 text-center"
              style={{ color: m.month === selected ? "var(--ink)" : undefined }}
            >
              {m.month.slice(5)}
            </span>
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>Saved each month against the plan</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Saved</th>
            <th>Plan</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td>{formatMonth(m.month, { long: true })}</td>
              <td>{formatAUD(m.saved)}</td>
              <td>{formatAUD(m.required)}</td>
              <td>{m.saved >= m.required ? "Cleared" : "Short"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
