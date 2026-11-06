import { Money } from "@/components/ui";
import type { categoryBreakdown } from "@/lib/aggregate";

export function CategoryBreakdownTable({
  breakdown,
}: {
  breakdown: ReturnType<typeof categoryBreakdown>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="eyebrow border-rule-strong border-b text-left">
            <th className="pb-2">Category</th>
            <th className="pb-2 text-right">Target</th>
            <th className="pb-2 text-right">Actual</th>
            <th className="pb-2 text-right">Variance</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((r) => {
            const denominator = r.target === null ? 0 : Math.max(r.actual, r.target);
            const fill = denominator ? (r.actual / denominator) * 100 : 0;
            const mark = denominator ? (r.target! / denominator) * 100 : 0;
            const over = r.target !== null && r.actual > r.target;
            return (
              <tr key={r.categoryId} className="border-rule border-b align-top">
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 flex-none rounded-sm"
                      style={{ background: r.oneOff ? "var(--oneoff)" : "var(--accent)" }}
                    />
                    {r.name}
                  </span>
                  {denominator > 0 && (
                    <span className="bg-track relative mt-1.5 block h-1 rounded">
                      <span
                        className="absolute inset-y-0 left-0 rounded"
                        style={{
                          width: `${fill.toFixed(1)}%`,
                          background: over ? "var(--spend)" : "var(--accent)",
                        }}
                      />
                      <span
                        className="bg-ink absolute -top-0.5 -bottom-0.5 w-0.5 rounded"
                        style={{ left: `${mark.toFixed(1)}%` }}
                      />
                    </span>
                  )}
                </td>
                <td className="text-muted py-2 pr-3 text-right">
                  {r.target === null ? "—" : <Money amount={r.target} />}
                </td>
                <td className="py-2 pr-3 text-right">
                  <Money amount={r.actual} cents />
                </td>
                <td className="py-2 text-right">
                  {r.variance === null ? "—" : <Money amount={r.variance} signed tone />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
