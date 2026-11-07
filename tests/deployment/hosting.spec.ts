import { expect, test } from "@playwright/test";

for (const [path, port] of [
  ["/", 4174],
  ["/Housedesign/", 4175],
] as const) {
  test(`production app and assets work at ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    page.on("requestfailed", (r) =>
      errors.push(`${r.url()} ${r.failure()?.errorText}`),
    );
    await page.goto(`http://127.0.0.1:${port}${path}`);
    await expect(
      page.getByRole("heading", { name: "Small plot. Big possibilities." }),
    ).toBeVisible();
    await expect(page.locator(".drawing")).toBeVisible();
    await expect(page.locator(".drawing [data-id]").first()).toBeVisible();
    await expect(page.locator(".app")).toHaveCSS("padding-left", "12px");
    // Exercise a lazy-loaded chunk too: PDF export must resolve on both hosts.
    await page.getByRole("button", { name: "Save & export" }).click();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: /↓ PDF/ }).click();
    expect((await downloaded).suggestedFilename()).toMatch(/\.pdf$/);
    expect(errors).toEqual([]);
  });
}
