import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { direction, type Design, type Room } from "../../src/model";
const key = "housedesign.autosave.v1";
async function state(page: Page): Promise<Design> {
  await page.waitForTimeout(450);
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
}
async function selectRoom(page: Page, kind: string): Promise<Room> {
  const d = await state(page),
    r = d.floors[0].rooms.find((r) => r.kind === kind)!;
  await page.locator(`svg [data-id="${r.id}"]`).click();
  return r;
}
async function point(page: Page, x: number, y: number) {
  return page.locator(".drawing").evaluate(
    (el, p) => {
      const svg = el as SVGSVGElement,
        q = svg.createSVGPoint();
      q.x = p.x;
      q.y = p.y;
      const s = q.matrixTransform(svg.getScreenCTM()!);
      return { x: s.x, y: s.y };
    },
    { x, y },
  );
}
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Small plot. Big possibilities." }),
  ).toBeVisible();
});
test("mobile exact editing, room addition, doors, stairs, undo and redo", async ({
  page,
}) => {
  await selectRoom(page, "kitchen");
  // True East is screen-left and down from plot centre, not screen-right.
  await page.getByRole("spinbutton", { name: "X position (ft)" }).fill("0");
  await page.getByRole("spinbutton", { name: "Y position (ft)" }).fill("21");
  await page
    .getByRole("spinbutton", { name: "Depth feet", exact: true })
    .fill("9");
  let d = await state(page);
  expect(d.floors[0].rooms.find((r) => r.kind === "kitchen")).toMatchObject({
    x: 0,
    y: 21,
    h: 9,
  });
  const eastKitchen = d.floors[0].rooms.find((r) => r.kind === "kitchen")!;
  expect(
    direction(d, {
      x: eastKitchen.x + eastKitchen.w / 2,
      y: eastKitchen.y + eastKitchen.h / 2,
    }),
  ).toBe("E");
  await selectRoom(page, "bedroom");
  await page
    .getByRole("spinbutton", { name: "Width feet", exact: true })
    .fill("9");
  await expect(
    page.getByRole("spinbutton", { name: "Width feet", exact: true }),
  ).toHaveValue("9");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Width feet", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  d = await state(page);
  expect(d.floors[0].rooms.find((r) => r.kind === "bedroom")?.w).toBe(9);
  await page.getByRole("button", { name: "＋ Add", exact: true }).click();
  await page.getByRole("button", { name: /Pooja 3 × 4 ft/ }).click();
  d = await state(page);
  expect(d.floors[0].rooms.filter((r) => r.kind === "pooja")).toHaveLength(2);
  await page.getByRole("button", { name: "＋ Door", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Wall edge", exact: true })
    .selectOption("left");
  await page.getByRole("button", { name: "Reverse door swing" }).click();
  d = await state(page);
  expect(d.floors[0].openings.at(-1)).toMatchObject({
    edge: "left",
    flip: true,
  });
  await selectRoom(page, "staircase");
  await page.getByRole("button", { name: "Move down 6 inches" }).click();
  expect(
    (await state(page)).floors[0].rooms.find((r) => r.kind === "staircase")?.y,
  ).toBe(23.5);
});
test("actual touch drag, resize, two finger pan and pinch", async ({
  page,
  context,
}) => {
  const d = await state(page),
    kitchen = d.floors[0].rooms.find((r) => r.kind === "kitchen")!;
  const client = await context.newCDPSession(page),
    start = await point(page, kitchen.x + 4, kitchen.y + 3),
    end = await point(page, kitchen.x + 5, kitchen.y + 5);
  const touch = async (
    type: string,
    pts: { x: number; y: number; id: number }[],
  ) =>
    client.send("Input.dispatchTouchEvent", {
      type: type as "touchStart",
      touchPoints: pts,
    });
  await touch("touchStart", [{ ...start, id: 1 }]);
  for (let i = 1; i <= 5; i++) {
    await touch("touchMove", [
      {
        x: start.x + ((end.x - start.x) * i) / 5,
        y: start.y + ((end.y - start.y) * i) / 5,
        id: 1,
      },
    ]);
    await page.waitForTimeout(30);
  }
  await touch("touchEnd", []);
  let moved = (await state(page)).floors[0].rooms.find(
    (r) => r.id === kitchen.id,
  )!;
  expect(moved.x).toBeCloseTo(kitchen.x + 1, 1);
  expect(moved.y).toBeCloseTo(kitchen.y + 2, 1);
  const corner = await point(page, moved.x + moved.w, moved.y + moved.h),
    resize = await point(page, moved.x + moved.w + 1, moved.y + moved.h + 1);
  await touch("touchStart", [{ ...corner, id: 1 }]);
  await touch("touchMove", [{ ...resize, id: 1 }]);
  await touch("touchEnd", []);
  moved = (await state(page)).floors[0].rooms.find((r) => r.id === kitchen.id)!;
  expect(moved.w).toBeCloseTo(kitchen.w + 1, 1);
  expect(moved.h).toBeCloseTo(kitchen.h + 1, 1);
  const svg = page.locator(".drawing"),
    initial = await svg.getAttribute("viewBox"),
    box = (await svg.boundingBox())!;
  const a = { x: box.x + box.width / 2 - 30, y: box.y + box.height / 2, id: 1 },
    b = { ...a, x: a.x + 60, id: 2 };
  await touch("touchStart", [a, b]);
  await touch("touchMove", [
    { ...a, x: a.x - 20, y: a.y + 25 },
    { ...b, x: b.x + 20, y: b.y + 25 },
  ]);
  await touch("touchEnd", []);
  expect(await svg.getAttribute("viewBox")).not.toBe(initial);
  const zoomed = (await svg.getAttribute("viewBox"))!.split(" ").map(Number),
    before = initial!.split(" ").map(Number);
  expect(zoomed[2]).toBeLessThan(before[2]);
  expect(zoomed[1]).not.toBe(before[1]);
  await page.getByRole("button", { name: "Fit plot", exact: true }).click();
  expect(await svg.getAttribute("viewBox")).toBe(initial);
});
test("flags overlap and outside plot; floor independence and plot compass updates", async ({
  page,
}) => {
  await selectRoom(page, "kitchen");
  await page.getByRole("spinbutton", { name: "Y position (ft)" }).fill("4");
  await page.getByRole("button", { name: /✓ Checks/ }).click();
  await expect(
    page
      .getByRole("button", { name: /Kitchen overlaps|overlaps Kitchen/ })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Kitchen overlaps|overlaps Kitchen/ })
    .first()
    .click();
  await page.getByRole("spinbutton", { name: "X position (ft)" }).fill("-2");
  await page.getByRole("button", { name: /✓ Checks/ }).click();
  await expect(
    page.getByRole("button", { name: /outside the plot/ }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /First floor FUTURE/ }).click();
  await expect(
    page.getByText("Dashed / faded: ground-floor reference"),
  ).toBeVisible();
  await page.getByRole("button", { name: "＋ Add", exact: true }).click();
  await page.getByRole("button", { name: /Bedroom 10 × 11 ft/ }).click();
  let d = await state(page);
  expect(d.floors[1].rooms).toHaveLength(1);
  expect(d.floors[0].rooms).toHaveLength(8);
  await page.getByRole("button", { name: "◇ Plot", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", {
      name: "Wall thickness inches",
      exact: true,
    }),
  ).toHaveValue("4.5");
  await page
    .getByRole("spinbutton", { name: "Road-facing bearing" })
    .fill("90");
  await expect(page.locator(".compass")).toHaveAttribute(
    "aria-label",
    /90 degrees/,
  );
  d = await state(page);
  expect(d.bearing).toBe(90);
});
test("named saves, reload, duplicate and JSON/PNG/PDF roundtrip", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Save & export" }).click();
  await page.getByLabel("Design name", { exact: true }).fill("My mobile home");
  await page
    .getByRole("button", { name: "Save snapshot", exact: true })
    .click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator(".saved-design")).toHaveCount(2);
  const original = await state(page);
  await page.reload();
  expect((await state(page)).name).toBe("My mobile home");
  await page.getByRole("button", { name: "Save & export" }).click();
  const jsonPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /↓ JSON/ }).click();
  const jsonDownload = await jsonPromise,
    raw = await readFile((await jsonDownload.path())!, "utf8");
  expect(JSON.parse(raw)).toEqual(original);
  for (const format of ["PNG", "PDF"]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: new RegExp("↓ " + format) }).click();
    const dl = await pending;
    await dl.saveAs(`test-results/export.${format.toLowerCase()}`);
    const contents = await readFile((await dl.path())!);
    expect(contents.length).toBeGreaterThan(1000);
    expect(
      format === "PNG"
        ? contents.subarray(1, 4).toString()
        : contents.subarray(0, 4).toString(),
    ).toBe(format === "PNG" ? "PNG" : "%PDF");
  }
  await page.locator("input[type=file]").setInputFiles({
    name: "design.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
  expect(await state(page)).toEqual(original);
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(page.getByRole("status")).toContainText("Import rejected");
  expect(await state(page)).toEqual(original);
  await page.getByRole("button", { name: "Start a fresh design" }).click();
  await page
    .locator(".saved-design")
    .first()
    .getByRole("button", { name: "Load", exact: true })
    .click();
  expect((await state(page)).name).toBe("My mobile home");
});
test("portrait and landscape layouts have no horizontal overflow or browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.screenshot({
    path: "test-results/mobile-portrait.png",
    fullPage: true,
  });
  for (const size of [
    { width: 360, height: 800 },
    { width: 844, height: 390 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".drawing")).toBeVisible();
  }
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
