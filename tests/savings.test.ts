import { describe, expect, it } from "vitest";
import {
  futureValue,
  monthsToGoal,
  projectFromActuals,
  projectSeries,
  requiredMonthlyForGoal,
  type SavingsPlan,
} from "@/lib/savings";

const plan: SavingsPlan = {
  id: "moderate",
  name: "Moderate",
  monthlyAmount: 2500,
  annualRate: 0.045,
  startingBalance: 22000,
  goalAmount: 180000,
  goalYears: 5,
  active: true,
};

describe("future value", () => {
  it("matches the figure a spreadsheet's FV would give", () => {
    // 2,500/month for 60 months at 4.5% nominal, compounded monthly, from
    // nothing: 2500 × ((1.00375^60 − 1) / 0.00375).
    const contributionsOnly = futureValue(
      { monthlyAmount: 2500, annualRate: 0.045, startingBalance: 0 },
      60,
    );

    expect(contributionsOnly).toBeCloseTo(167864.12, 0);
  });

  it("compounds the opening balance too", () => {
    const withOpening = futureValue(plan, 60);
    const withoutOpening = futureValue({ ...plan, startingBalance: 0 }, 60);

    expect(withOpening - withoutOpening).toBeCloseTo(22000 * Math.pow(1.00375, 60), 0);
  });

  it("is just addition when the rate is zero", () => {
    expect(futureValue({ monthlyAmount: 500, annualRate: 0, startingBalance: 1000 }, 12)).toBe(
      7000,
    );
  });

  it("returns the opening balance for no months at all", () => {
    expect(futureValue(plan, 0)).toBe(22000);
  });
});

describe("the contribution a goal requires", () => {
  it("round-trips through future value", () => {
    // Whatever it says is needed, paying exactly that must land on the goal.
    const needed = requiredMonthlyForGoal(180000, 60, 0.045, 22000);
    const landed = futureValue(
      { monthlyAmount: needed, annualRate: 0.045, startingBalance: 22000 },
      60,
    );

    expect(landed).toBeCloseTo(180000, 0);
  });

  it("asks for nothing when the goal is already met", () => {
    expect(requiredMonthlyForGoal(10000, 60, 0.045, 20000)).toBe(0);
  });

  it("splits the shortfall evenly at a zero rate", () => {
    expect(requiredMonthlyForGoal(12000, 12, 0, 0)).toBe(1000);
  });
});

describe("when the goal is reached", () => {
  it("finds the month, and agrees with the projection at that point", () => {
    const months = monthsToGoal(plan);

    expect(months).not.toBeNull();
    expect(futureValue(plan, months!)).toBeGreaterThanOrEqual(180000);
    expect(futureValue(plan, months! - 1)).toBeLessThan(180000);
  });

  it("says so when a plan never gets there", () => {
    expect(monthsToGoal({ ...plan, monthlyAmount: 1, annualRate: 0 }, 120)).toBeNull();
  });

  it("is month zero when the balance already covers it", () => {
    expect(monthsToGoal({ ...plan, startingBalance: 200000 })).toBe(0);
  });
});

describe("projecting from what actually happened", () => {
  it("uses real months first and the plan afterwards", () => {
    const actuals = [
      { month: "2025-03", saved: 3017.17 },
      { month: "2025-04", saved: 2976.87 },
    ];
    const points = projectFromActuals(actuals, plan, 12);

    expect(points).toHaveLength(12);
    expect(points[0].month).toBe("2025-03");
    expect(points[1].month).toBe("2025-04");
    expect(points[2].month).toBe("2025-05"); // the plan takes over here
    expect(points[1].contributed).toBeCloseTo(22000 + 3017.17 + 2976.87, 2);
  });

  it("separates what was paid in from what the interest added", () => {
    const points = projectSeries(plan, 60);
    const last = points[points.length - 1];

    expect(last.contributed).toBe(22000 + 2500 * 60);
    expect(last.interest).toBeCloseTo(last.balance - last.contributed, 2);
    expect(last.interest).toBeGreaterThan(0);
  });
});
