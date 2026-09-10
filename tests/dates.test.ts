import { afterEach, describe, expect, it } from "vitest";
import { currentMonthIn, dateFromDriver, isIsoDate, todayIn } from "@/lib/dates";

const ZONES = ["Australia/Perth", "Asia/Seoul", "UTC", "America/Los_Angeles"];

describe("what day it is", () => {
  it("answers for the person, not for the server", () => {
    // 22:30 UTC on 30 September is already 1 October in Perth and Seoul.
    const at = new Date("2025-09-30T22:30:00Z");

    expect(todayIn("UTC", at)).toBe("2025-09-30");
    expect(todayIn("Australia/Perth", at)).toBe("2025-10-01");
    expect(todayIn("Asia/Seoul", at)).toBe("2025-10-01");
    expect(currentMonthIn("Australia/Perth", at)).toBe("2025-10");
    expect(currentMonthIn("UTC", at)).toBe("2025-09");
  });
});

describe("dates coming back from a driver", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it("keeps the day a date column meant, in every timezone", () => {
    // A `date` column has no time and no zone. Drivers materialise it at local
    // midnight, and `toISOString()` on that moves it back a day east of UTC —
    // silently, because the totals still add up under the wrong day.
    for (const zone of ZONES) {
      process.env.TZ = zone;
      const midnight = new Date(2025, 2, 1, 0, 0, 0);

      expect(dateFromDriver(midnight)).toBe("2025-03-01");
    }
  });

  it("passes a string through untouched", () => {
    expect(dateFromDriver("2025-03-01")).toBe("2025-03-01");
    expect(dateFromDriver("2025-03-01T00:00:00.000Z")).toBe("2025-03-01");
  });
});

describe("validating a date string", () => {
  it("rejects days that do not exist", () => {
    expect(isIsoDate("2025-03-01")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2025-13-01")).toBe(false);
    expect(isIsoDate("01/03/2025")).toBe(false);
  });
});
