import { formatAUD } from "@/lib/money";

/** Figures line up only if the digits are tabular and the sign is consistent. */
export function Money({
  amount,
  cents,
  signed,
  tone,
}: {
  amount: number;
  cents?: boolean;
  signed?: boolean;
  tone?: boolean;
}) {
  const text = formatAUD(amount, { cents });
  const colour = !tone ? undefined : amount < 0 ? "var(--fail)" : "var(--pass)";
  return (
    <span className="tabular whitespace-nowrap" style={{ color: colour }}>
      {signed && amount > 0 ? "+" : ""}
      {text}
    </span>
  );
}
