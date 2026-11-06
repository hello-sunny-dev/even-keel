/**
 * Where a goal is, against where it should be.
 *
 * The marker is the point of the thing: a bar showing 40% of the way there
 * says nothing without knowing whether 40% is early or late.
 */
export function GoalBar({
  percent,
  expectedPercent,
  onTrack,
}: {
  percent: number;
  expectedPercent: number;
  onTrack: boolean;
}) {
  return (
    <div className="relative mt-2 mb-1 h-2 rounded-full" style={{ background: "var(--track)" }}>
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${Math.max(percent, 0.5)}%`,
          background: onTrack ? "var(--pass)" : "var(--fail)",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-1 -bottom-1 w-[2px] rounded-full"
        style={{ left: `${expectedPercent}%`, background: "var(--ink)" }}
      />
    </div>
  );
}
