import { Button } from "@/components/ui";
import { formatMonth } from "@/lib/months";

export function MonthPicker({ month, months }: { month: string; months: string[] }) {
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const year = month.slice(0, 4);

  return (
    <form className="mb-6 flex flex-wrap gap-2">
      <label className="sr-only" htmlFor="month">
        Month
      </label>
      <select
        id="month"
        name="month"
        defaultValue={month}
        className="border-rule-strong bg-sheet rounded-lg border px-3 py-2 text-sm"
      >
        {[...new Set([month, ...months])]
          .sort((a, b) => b.localeCompare(a))
          .map((m) => (
            <option key={m} value={m}>
              {formatMonth(m, { long: true })}
            </option>
          ))}
      </select>
      <Button variant="secondary" type="submit">
        Show
      </Button>
      {years.length > 1 && (
        <span className="text-faint self-center text-xs">
          {years.length} years of history · showing {year}
        </span>
      )}
    </form>
  );
}
