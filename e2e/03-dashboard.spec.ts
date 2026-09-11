import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the month strip is the navigation, not a picture of one", async ({ page }) => {
  await page.goto("/");

  // Asserted, not skipped past: by now a statement has been imported and rows
  // have been entered by hand, so a strip that is not there is a failure.
  const strip = page.getByRole("figure").filter({ hasText: /saved each month/i });
  await expect(strip).toBeVisible();

  const bars = strip.getByRole("link");
  await expect(bars.first()).toBeVisible();
  expect(await bars.count()).toBeGreaterThan(1);

  const heading = page.getByRole("heading", { level: 1 });
  const before = await heading.innerText();
  await bars.first().click();
  await page.waitForURL(/month=/);
  await expect(heading).not.toHaveText(before);
});

test("switching the scenario changes the verdict, not the month", async ({ page }) => {
  await page.goto("/goals");

  const amounts = page.getByLabel("A month");
  await expect(amounts).toHaveCount(3);

  // An amount nothing could clear, marked as ours, so the headline has to flip.
  await amounts.nth(1).fill("999999");
  await page.getByRole("button", { name: /save scenarios/i }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.goto("/");
  // All three are scored every month; the active one decides the headline.
  await expect(page.getByText("Against every scenario")).toBeVisible();
  await expect(page.getByText("Short").first()).toBeVisible();
});

/**
 * The policy mints a nonce per request and allows exactly one style hash — the
 * empty string Framer Motion inserts. That is precise enough to break on a
 * dependency bump, and the symptom is a page that renders unstyled rather than
 * an error anybody would see in a log.
 */
test("the content security policy refuses nothing the app needs", async ({ page }) => {
  const refusals: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
      refusals.push(message.text());
    }
  });

  for (const path of ["/", "/add", "/trends", "/goals"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(refusals, refusals.join("\n")).toEqual([]);
});

for (const path of ["/", "/add", "/trends", "/one-offs", "/goals", "/transactions"]) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`),
      JSON.stringify(serious, null, 2),
    ).toEqual([]);
  });
}
