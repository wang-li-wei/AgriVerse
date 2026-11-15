import { test, expect } from "@playwright/test";

test("三种角色完整流程、动画回执、共享状态与窄屏布局", async ({ page }) => {
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
  await expect(
    page.getByRole("button", {
      name: "一起看看，哪些番茄成熟了？",
      exact: false,
    }),
  ).toBeEnabled();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("正在构建你的温室…")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/01-greenhouse-desktop.png",
    fullPage: true,
  });
  await page.locator(".start-task").click();
  await expect(page.getByTestId("confirmation-card")).toContainText(
    "3 颗符合条件",
  );
  await expect(page.getByTestId("basket-count")).toHaveText("00");
  await page.getByRole("button", { name: "确认并模拟采摘" }).click();
  await expect(page.getByText("正在采摘 T01", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/02-harvest-action.png" });
  await expect(page.getByTestId("basket-count")).toHaveText("03", {
    timeout: 40000,
  });
  await expect(page.getByRole("tab", { name: "研学学生" })).toBeEnabled();
  await page.getByRole("tab", { name: "研学学生" }).click();
  await expect(page.locator(".fruit-pill.harvested")).toHaveCount(3);
  // Restore fixture world to let the student perform their own independent demonstration.
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("button", { name: "重置整个演示", exact: false })
    .click();
  await page.locator(".start-task").click();
  await expect(page.getByText("轮到你来选择了", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "选择 T02 转色", exact: true })
    .click();
  await page.getByRole("button", { name: "提交答案 · T02" }).click();
  await expect(
    page
      .locator(".agent-message.assistant p")
      .filter({ hasText: "再观察一下：" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "选择 T01 红熟", exact: true })
    .click();
  await page.getByRole("button", { name: "提交答案 · T01" }).click();
  await expect(page.getByTestId("confirmation-card")).toBeVisible();
  await page.getByRole("button", { name: "确认并模拟采摘" }).click();
  await expect(page.getByText("挑战完成！", { exact: false })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator(".fruit-pill.harvested")).toHaveCount(1);
  await page.getByRole("tab", { name: "农业专家" }).click();
  await page.locator(".start-task").click();
  await expect(
    page.getByRole("button", { name: "确认拨叶并查看" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "确认拨叶并查看" }).click();
  await expect(page.getByText("已补充观察", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "农业专家" })).toBeEnabled();
  await page.screenshot({
    path: "test-results/03-expert-reveal.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "会诊摘要", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("待专家核实");
  await expect(page.getByRole("dialog")).toContainText("预置历史");
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await page
    .getByRole("button", { name: "查看环境趋势", exact: false })
    .click();
  await page.getByRole("button", { name: "温度 °C", exact: true }).click();
  await expect(page.getByRole("img", { name: "温度趋势" })).toBeVisible();
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/04-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
