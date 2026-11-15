import { test, expect } from "@playwright/test";
import type { SceneInspection } from "../../src/scene/SceneMotion";
test.setTimeout(240000);
test.use({ video: { mode: "on", size: { width: 1440, height: 900 } } });
const inspect = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.__agriverseScene?.inspect());
test("复叶、果串与三个视角；拨叶几何关系、原果实连续性和重置", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("fonts.googleapis")
    )
      errors.push(message.text());
  });
  await page.goto("/");
  await expect
    .poll(async () => Object.keys((await inspect(page))?.leaves ?? {}).length)
    .toBe(12);
  await expect(page.locator(".scene-fallback")).toHaveCount(0);
  for (const [view, label, position] of [
    ["overview", "温室全景", [5.8, 4.7, 8.2]],
    ["front", "植株正视", [0.25, 2.6, 6.2]],
    ["detail", "果实近景", [1.65, 3.0, 4.0]],
  ] as const) {
    await page.getByRole("button", { name: "场景视角", exact: true }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect
      .poll(async () => {
        const s = await inspect(page);
        return s
          ? Math.hypot(...s.cameraPosition.map((v, i) => v - position[i]))
          : 99;
      })
      .toBeLessThan(0.03);
    console.log(view, JSON.stringify((await inspect(page))?.occlusion));
    expect((await inspect(page))?.occlusion).toEqual({
      fruit: true,
      disease: true,
    });
    await page.screenshot({
      path: `test-results/plant-${view}.png`,
      fullPage: true,
    });
  }
  await page.locator(".plant-label").click();
  await page.getByRole("button", { name: "近景观察", exact: true }).click();
  // Use the existing selection API to frame a specific compound leaf for visual QA.
  await page.evaluate(async () => {
    const path = "/src/store.ts";
    const { useStore } = await import(path);
    useStore.getState().select("P01_LEAF_04");
  });
  await page.waitForTimeout(1800);
  await page
    .locator(".scene-canvas")
    .screenshot({ path: "test-results/plant-leaf-closeup.png" });
  const initial = (await inspect(page)) as SceneInspection;
  console.log(
    "initial observation",
    JSON.stringify({
      disease: initial.diseasePosition,
      leaf: initial.leaves.P01_LEAF_06,
      occlusion: initial.occlusion,
    }),
  );
  await page.getByRole("tab", { name: "农业专家" }).click();
  await page.locator(".start-task").click();
  await page.getByRole("button", { name: "确认拨叶并查看" }).waitFor();
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: "test-results/plant-reveal-before.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "确认拨叶并查看" }).click();
  await expect(page.getByText("已补充观察", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "农户", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(1400);
  const revealed = (await inspect(page)) as SceneInspection;
  console.log("revealed observation", JSON.stringify(revealed.occlusion));
  expect(
    revealed.leaves.P01_LEAF_06.rotation[1] -
      initial.leaves.P01_LEAF_06.rotation[1],
  ).toBeGreaterThan(0.8);
  expect(revealed.occlusion.disease).toBe(false);
  expect(revealed.occlusion.fruit).toBe(false);
  console.log("disease surface visible", revealed.diseaseVisible);
  expect(revealed.diseaseVisible).toBe(true);
  await page.screenshot({
    path: "test-results/plant-detail-revealed.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "放大模拟病斑", exact: true }).click();
  await page.waitForTimeout(1800);
  expect((await inspect(page))?.diseaseVisible).toBe(true);
  await page.screenshot({
    path: "test-results/plant-lesion-zoom-page.png",
    fullPage: true,
  });
  await page
    .locator(".scene-canvas")
    .screenshot({ path: "test-results/plant-lesion-zoom.png" });
  await page
    .getByRole("button", { name: "返回病叶与周围组织", exact: true })
    .click();
  await page
    .getByRole("button", { name: "选择 T06 红熟", exact: true })
    .click();
  await expect(page.locator(".selection-card")).not.toContainText("存在遮挡");
  await page.getByRole("tab", { name: "农户", exact: true }).click();
  await page.locator(".start-task").click();
  await page.getByRole("button", { name: "确认并模拟采摘" }).click();
  await expect
    .poll(async () => (await inspect(page))?.progress ?? 0)
    .toBeGreaterThan(0.46);
  expect((await inspect(page))?.fruits.T01.uuid).toBe(initial.fruits.T01.uuid);
  await page.screenshot({
    path: "test-results/plant-harvest-motion.png",
    fullPage: true,
  });
  // Sample actual rendered positions throughout transport, not only the start card.
  const samples = await page.evaluate(async () => {
    const result: { uuid: string; position: number[]; time: number }[] = [];
    const start = performance.now();
    while (performance.now() - start < 4200) {
      const fruit = window.__agriverseScene!.inspect().fruits.T01;
      result.push({
        uuid: fruit.uuid,
        position: fruit.position,
        time: performance.now(),
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return result;
  });
  expect(samples.length).toBeGreaterThan(8);
  expect(samples.every((s) => s.uuid === initial.fruits.T01.uuid)).toBe(true);
  for (let i = 1; i < samples.length; i++) {
    const distance = Math.hypot(
      ...samples[i].position.map((v, j) => v - samples[i - 1].position[j]),
    );
    expect(
      distance / ((samples[i].time - samples[i - 1].time) / 1000),
    ).toBeLessThan(6);
  }
  await expect(page.getByTestId("basket-count")).toHaveText("03", {
    timeout: 40000,
  });
  const harvested = (await inspect(page)) as SceneInspection;
  expect(harvested.fruits.T01.uuid).toBe(initial.fruits.T01.uuid);
  expect(
    Math.hypot(
      ...harvested.fruits.T01.position.map((v, i) => v - [1.48, 0.38, 1.18][i]),
    ),
  ).toBeLessThan(0.01);
  await expect(
    page.getByRole("button", { name: "选择 T01 已采摘", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "农户", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "场景视角", exact: true }).click();
  await page.getByRole("button", { name: "植株正视", exact: true }).click();
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: "test-results/plant-harvest-complete.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "选择 T01 已采摘", exact: true })
    .click();
  await page.getByRole("button", { name: "近景观察", exact: true }).click();
  await page.waitForTimeout(1800);
  await expect(page.locator(".selection-card")).toContainText("已采摘");
  expect(harvested.fruits.T01.parent).toBe("T01_PEDICEL");
  await page.screenshot({
    path: "test-results/plant-basket-complete.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("button", { name: "重置整个演示", exact: false })
    .click();
  await expect(page.getByTestId("basket-count")).toHaveText("00");
  await expect
    .poll(async () =>
      Math.abs(
        ((await inspect(page))?.leaves.P01_LEAF_06.rotation[1] ?? 99) -
          initial.leaves.P01_LEAF_06.rotation[1],
      ),
    )
    .toBeLessThan(0.01);
  expect((await inspect(page))?.fruits.T01.uuid).toBe(initial.fruits.T01.uuid);
  expect(
    Math.hypot(
      ...(await inspect(page))!.fruits.T01.position.map(
        (v, i) => v - initial.fruits.T01.position[i],
      ),
    ),
  ).toBeLessThan(0.02);
  expect(errors).toEqual([]);
});
test("动作失败时回滚同一个果实并恢复叶片", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(async () => Object.keys((await inspect(page))?.fruits ?? {}).length)
    .toBe(6);
  const initial = (await inspect(page)) as SceneInspection;
  await page.route("**/actions/*/ack", (route) =>
    route.continue({ postData: JSON.stringify({ success: false }) }),
  );
  await page.locator(".start-task").click();
  await page.getByRole("button", { name: "确认并模拟采摘" }).click();
  await expect(
    page.locator(".agent-message.assistant p").filter({ hasText: "动作中止" }),
  ).toBeVisible();
  await expect(page.getByTestId("basket-count")).toHaveText("00");
  await expect
    .poll(async () =>
      Math.hypot(
        ...(await inspect(page))!.fruits.T01.position.map(
          (v, i) => v - initial.fruits.T01.position[i],
        ),
      ),
    )
    .toBeLessThan(0.025);
  expect((await inspect(page))?.fruits.T01.uuid).toBe(initial.fruits.T01.uuid);
});
