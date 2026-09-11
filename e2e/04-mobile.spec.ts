import { expect, test } from "@playwright/test";

/**
 * The phone is the primary device, so these are not a nicety.
 *
 * A page that scrolls sideways on a phone is a page whose right-hand column is
 * invisible, and nothing in the layout says it is there.
 */
const PAGES = ["/", "/add", "/review", "/trends", "/one-offs", "/goals", "/assets"];

for (const path of PAGES) {
  test(`${path} fits the screen`, async ({ page }) => {
    await page.goto(path);
    // The login page fits any screen. Asserting the width without asserting
    // that the session survived is a test that passes by being signed out.
    await expect(page).not.toHaveURL(/\/login/);
    const [scroll, inner] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    expect(scroll, `${path} scrolls sideways`).toBeLessThanOrEqual(inner);
  });
}

test("every destination is reachable from the phone's bottom bar", async ({ page }) => {
  await page.goto("/");

  // Four tabs, and More announces the rest — a row of nine pills that scrolls
  // sideways hides five destinations behind a gesture with nothing to say so.
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const label of ["Home", "Add", "Review"]) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  await nav.getByRole("button", { name: "More" }).click();
  // Scoped to the menu: the desktop row renders the same links and hides them
  // with CSS, so an unscoped query finds the hidden copy first.
  const menu = page.getByRole("list", { name: "More destinations" });

  for (const label of ["Ledger", "Net worth", "Trends", "Goals", "One-offs", "Settings"]) {
    await expect(menu.getByRole("link", { name: label })).toBeVisible();
  }
});
