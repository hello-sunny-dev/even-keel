import { formatAUD } from "@/lib/money";

export function Heading({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
}) {
  return (
    <header className="mb-6">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {lede && <p className="text-muted mt-2 max-w-prose text-sm">{lede}</p>}
    </header>
  );
}

export function Note({
  tone = "plain",
  children,
}: {
  tone?: "plain" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const bar = tone === "warn" ? "var(--oneoff)" : tone === "bad" ? "var(--fail)" : "var(--accent)";
  return (
    <div className="border-rule bg-sunk text-muted flex gap-3 rounded-lg border p-3 text-sm">
      <span className="w-[3px] flex-none rounded-full" style={{ background: bar }} />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

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

export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-rule-strong bg-sunk rounded-xl border border-dashed p-8 text-center">
      <p className="text-base font-semibold">{title}</p>
      <div className="text-muted mx-auto mt-2 max-w-prose text-sm">{children}</div>
    </div>
  );
}
