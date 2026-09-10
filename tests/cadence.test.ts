import { describe, expect, it } from "vitest";
import {
  FORTNIGHTLY,
  MONTHLY,
  cyclesInMonth,
  describeCadence,
  detectCadence,
  toMonthlyRate,
} from "@/lib/cadence";

describe("converting a cadence to a monthly rate", () => {
  it("does not mistake fortnightly for twice monthly", () => {
    // About 26.09 payments a year, not 24. Treating a $650 fortnightly car
    // loan as $1,300 a month understates it by a month's worth every year.
    expect(toMonthlyRate(650, FORTNIGHTLY)).toBeCloseTo(1413.17, 1);
    expect(toMonthlyRate(650, FORTNIGHTLY)).toBeGreaterThan(1300);
  });

  it("spreads slower cycles across the months they cover", () => {
    expect(toMonthlyRate(300, { unit: "month", count: 2 })).toBe(150);
    expect(toMonthlyRate(1200, { unit: "month", count: 12 })).toBe(100);
    expect(toMonthlyRate(100, MONTHLY)).toBe(100);
  });
});

describe("detecting a cadence from history", () => {
  const every = (start: string, days: number, n: number) => {
    const out: string[] = [];
    const at = new Date(`${start}T00:00:00Z`);
    for (let i = 0; i < n; i++) {
      out.push(at.toISOString().slice(0, 10));
      at.setUTCDate(at.getUTCDate() + days);
    }
    return out;
  };

  it("recognises the rhythms this household actually has", () => {
    expect(detectCadence(every("2025-01-03", 14, 8))).toEqual({ unit: "week", count: 2 });
    expect(detectCadence(every("2025-01-04", 30, 6))).toEqual({ unit: "month", count: 1 });
    expect(detectCadence(every("2025-01-06", 61, 5))).toEqual({ unit: "month", count: 2 });
    expect(detectCadence(every("2023-01-06", 365, 4))).toEqual({ unit: "month", count: 12 });
  });

  it("survives one missed or doubled bill, because the median ignores it", () => {
    const dates = ["2025-01-05", "2025-02-05", "2025-03-05", "2025-07-05", "2025-08-05"];

    expect(detectCadence(dates)).toEqual({ unit: "month", count: 1 });
  });

  it("declines to name a rhythm that isn't one", () => {
    expect(detectCadence(["2025-01-05", "2025-01-19", "2025-06-02"])).toBeNull();
    expect(detectCadence(["2025-01-05", "2025-02-05"])).toBeNull();
  });
});

describe("counting cycles inside a month", () => {
  it("finds the months where fortnightly pay lands three times", () => {
    // Twice a year this happens, and that month clears every savings scenario
    // for reasons that have nothing to do with spending.
    const anchor = "2025-01-03";
    const counts = [
      "2025-01",
      "2025-02",
      "2025-03",
      "2025-04",
      "2025-05",
      "2025-06",
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
    ].map((m) => cyclesInMonth(FORTNIGHTLY, m, anchor));

    expect(counts.filter((c) => c === 3)).toHaveLength(2);
    expect(counts.filter((c) => c === 2)).toHaveLength(10);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(26);
  });

  it("puts a bimonthly bill in every second month", () => {
    const bimonthly = { unit: "month", count: 2 } as const;

    expect(cyclesInMonth(bimonthly, "2025-03", "2025-01-15")).toBe(1);
    expect(cyclesInMonth(bimonthly, "2025-04", "2025-01-15")).toBe(0);
  });
});

describe("naming a cadence", () => {
  it("uses the words a person would", () => {
    expect(describeCadence(FORTNIGHTLY)).toBe("fortnightly");
    expect(describeCadence(MONTHLY)).toBe("monthly");
    expect(describeCadence({ unit: "month", count: 12 })).toBe("annually");
  });
});
