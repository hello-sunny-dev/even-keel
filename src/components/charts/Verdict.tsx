/** Never colour alone: the word is the signal and the colour agrees with it. */
export function Verdict({ good, children }: { good: boolean; children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-2 py-[2px] text-xs font-medium"
      style={{
        background: good ? "var(--pass)" : "var(--fail)",
        color: "var(--paper)",
      }}
    >
      {children}
    </span>
  );
}
