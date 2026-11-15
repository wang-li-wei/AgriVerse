import { writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import type { ExecutionEvent } from "../../src/types";
import type { SceneInspection } from "../../src/scene/SceneMotion";
test.setTimeout(160000);
test.use({ video: { mode: "on", size: { width: 1440, height: 900 } } });
async function state(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const s = window.__agriverseScene!.inspect();
    return {
      action: s.actionData,
      execution: s.execution,
      world: s.world!,
      busy: s.busy,
    };
  });
}
async function inspect(page: import("@playwright/test").Page) {
  return page.evaluate(() => window.__agriverseScene!.inspect());
}
async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForFunction(
    () =>
      Object.keys(window.__agriverseScene?.inspect().fruits ?? {}).length === 6,
  );
}
for (const single of [true, false])
  test(
    single
      ? "单果完整执行与实时事件、禁止运行中重置"
      : "多果独立执行、原果实跟随、提交后验证",
    async ({ page, request }) => {
      await ready(page);
      const initial = await inspect(page);
      if (single) await page.getByRole("tab", { name: "研学学生" }).click();
      await page.locator(".start-task").click();
      if (single) {
        await expect(
          page.getByText("轮到你来选择了", { exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "选择 T01 红熟", exact: true })
          .click();
        await page.getByRole("button", { name: "提交答案 · T01" }).click();
      }
      await page.getByRole("button", { name: "确认并模拟采摘" }).click();
      await expect
        .poll(async () =>
          (await state(page)).execution.some(
            (e) => e.type === "action_stage" && e.stage === "approach",
          ),
        )
        .toBe(true);
      const during = await state(page);
      const runId = during.action!.run_id;
      expect(during.world.collected).toHaveLength(0);
      expect(
        during.execution
          .filter((e) => e.run_id === runId)
          .some((e) => e.type === "run_completed"),
      ).toBe(false);
      await expect(page.getByTestId("current-stage")).toContainText("接近");
      if (single) {
        const sid = await page.evaluate(() =>
          sessionStorage.getItem("agriverse-session"),
        );
        expect(
          (
            await request.post(
              `http://127.0.0.1:8000/api/sessions/${sid}/reset`,
              { data: {} },
            )
          ).status(),
        ).toBe(409);
        await page.getByRole("button", { name: "设置", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "重置整个演示", exact: false }),
        ).toBeDisabled();
        await page
          .getByRole("button", { name: "关闭弹窗", exact: true })
          .click();
        expect((await state(page)).action?.id).toBe(during.action!.id);
      }
      await expect
        .poll(async () => (await inspect(page)).stage, { intervals: [100, 150, 200] })
        .toBe("transport");
      const carried = await inspect(page);
      expect(carried.fruits.T01.uuid).toBe(initial.fruits.T01.uuid);
      expect(
        Math.hypot(
          ...carried.fruits.T01.position.map(
            (v, i) => v - carried.gripPosition[i],
          ),
        ),
      ).toBeLessThan(0.04);
      await page.screenshot({
        path: `test-results/execution-${single ? "single" : "multi"}-transport.png`,
        fullPage: true,
      });
      await expect
        .poll(async () => (await state(page)).world.collected.length, {
          timeout: 45000,
        })
        .toBe(single ? 1 : 3);
      if (!single)
        await expect(page.getByTestId("basket-count")).toHaveText("03");
      await expect.poll(async () => (await state(page)).busy).toBe(false);
      const final = await state(page);
      const events = final.execution.filter((e) => e.run_id === runId);
      writeFileSync(
        `test-results/execution-${single ? "single" : "multi"}-events.json`,
        JSON.stringify(events, null, 2),
      );
      expect(events.at(-1)?.type).toBe("run_completed");
      const stages = events.filter(
        (e) => e.type === "action_stage" && e.status === "started",
      );
      const targetIds = single ? ["T01"] : ["T01", "T03", "T05"];
      for (const target of targetIds) {
        expect(
          stages.filter((e) => e.target_id === target).map((e) => e.stage),
        ).toEqual([
          "approach",
          "align",
          "grip",
          "detach",
          "transport",
          "release",
          "retreat",
          "verify",
        ]);
        const verification = events.find(
          (e) =>
            e.type === "verification" &&
            e.target_id === target &&
            e.status === "completed",
        )!;
        expect(verification.seq).toBeGreaterThan(
          stages.find((e) => e.target_id === target && e.stage === "verify")!
            .seq,
        );
        expect(
          final.world.fruits.find(
            (f: { fruit_id: string }) => f.fruit_id === target,
          ).status,
        ).toBe("harvested");
        expect((await inspect(page)).fruits[target].uuid).toBe(
          initial.fruits[target].uuid,
        );
      }
      expect(events.map((e) => e.seq)).toEqual(
        [...events].map((e) => e.seq).sort((a, b) => a - b),
      );
      const starts = stages.filter((e) => e.target_id === "T01");
      expect(
        Date.parse(starts.at(-1)!.timestamp) - Date.parse(starts[0].timestamp),
      ).toBeGreaterThan(7500);
      await page
        .getByRole("button", { name: `选择 T01 已采摘`, exact: true })
        .click();
      await page.getByRole("button", { name: "近景观察", exact: true }).click();
      await page.waitForTimeout(1600);
      await page.screenshot({
        path: `test-results/execution-${single ? "single" : "multi"}-complete.png`,
        fullPage: true,
      });
    },
  );
test("拨叶、保持、退出与后续观察分开记录", async ({ page }) => {
  await ready(page);
  const initial = await inspect(page);
  await page.getByRole("tab", { name: "农业专家" }).click();
  await page.locator(".start-task").click();
  // hold lasts 640 ms; listen for its real scene report instead of sampling at 1 s intervals.
  const holding = page.waitForRequest((request) => request.url().endsWith("/stage") && request.method() === "POST" && request.postDataJSON().index === 3);
  await page.getByRole("button", { name: "确认拨叶并查看" }).click();
  await holding;
  const held = await inspect(page);
  expect(
    held.leaves.P01_LEAF_06.rotation[1] -
      initial.leaves.P01_LEAF_06.rotation[1],
  ).toBeGreaterThan(0.8);
  expect(held.leaves.P01_LEAF_05.rotation).not.toEqual(
    initial.leaves.P01_LEAF_05.rotation,
  );
  await page.screenshot({
    path: "test-results/execution-reveal-hold.png",
    fullPage: true,
  });
  await expect(page.getByText("已补充观察", { exact: true })).toBeVisible();
  await expect.poll(async () => (await state(page)).busy).toBe(false);
  const final = await state(page);
  const run = final.execution.at(-1)!.run_id;
  const events = final.execution.filter((e) => e.run_id === run);
  writeFileSync(
    "test-results/execution-reveal-events.json",
    JSON.stringify(events, null, 2),
  );
  expect(events.at(-1)?.type).toBe("run_completed");
  const verify = events.find(
    (e) => e.type === "verification" && e.status === "completed",
  )!;
  const observe = events.find(
    (e) => e.type === "observation" && e.tool_name === "inspect_plant_health",
  )!;
  expect(observe.seq).toBeGreaterThan(verify.seq);
  expect(observe.result?.diagnosis).toBeNull();
  expect((await inspect(page)).diseaseVisible).toBe(true);
  await page.screenshot({
    path: "test-results/execution-reveal-complete.png",
    fullPage: true,
  });
});
test("后端拒绝结果回执，原果实回滚且不宣布成功", async ({ page }) => {
  await ready(page);
  const initial = await inspect(page);
  await page.route("**/actions/*/ack", (route) => {
    const data = route.request().postDataJSON();
    return route.continue({
      postData: JSON.stringify(
        data.success
          ? { ...data, evidence: { ...data.evidence, position: [99, 99, 99] } }
          : data,
      ),
    });
  });
  await page.locator(".start-task").click();
  await page.getByRole("button", { name: "确认并模拟采摘" }).click();
  await expect
    .poll(async () => (await state(page)).execution.at(-1)?.type, {
      timeout: 20000,
    })
    .toBe("run_failed");
  await expect(page.getByTestId("basket-count")).toHaveText("00");
  await expect
    .poll(async () =>
      Math.hypot(
        ...(await inspect(page)).fruits.T01.position.map(
          (v, i) => v - initial.fruits.T01.position[i],
        ),
      ),
    )
    .toBeLessThan(0.025);
  await expect(page.getByTestId("execution-timeline")).toContainText(
    "执行未成功",
  );
});
test("断流不会产生虚假成功或后台提交", async ({ page, context, request }) => {
  await ready(page);
  await page.locator(".start-task").click();
  await page.getByRole("button", { name: "确认并模拟采摘" }).click();
  await expect.poll(async () => (await inspect(page)).stage, { intervals: [100, 150, 200] }).toBe("align");
  const sid = await page.evaluate(() =>
    sessionStorage.getItem("agriverse-session"),
  );
  const beforeDisconnect = await state(page);
  const interruptedTarget = beforeDisconnect.action!.target_id;
  await context.setOffline(true);
  await expect
    .poll(async () => (await state(page)).busy, { timeout: 12000 })
    .toBe(false);
  await context.setOffline(false);
  const world = await (
    await request.get(`http://127.0.0.1:8000/api/sessions/${sid}`)
  ).json();
  expect(world.collected).toEqual(beforeDisconnect.world.collected);
  expect(world.collected).not.toContain(interruptedTarget);
  await expect(page.getByTestId("execution-timeline")).toContainText(
    "执行未成功",
  );
});
test("真实等待回执超时后失败，不将入箱动画当作提交成功", async ({ page }) => {
  await ready(page);
  await page.route("**/actions/*/ack", (route) =>
    route.fulfill({ json: { accepted: true } }),
  );
  await page.locator(".start-task").click();
  await page.getByRole("button", { name: "确认并模拟采摘" }).click();
  await expect
    .poll(async () => (await inspect(page)).progress, { timeout: 18000 })
    .toBe(1);
  expect((await state(page)).world.collected).toHaveLength(0);
  await expect(page.getByTestId("execution-timeline")).not.toContainText(
    "本轮已验证完成",
  );
  await expect
    .poll(async () => (await state(page)).execution.at(-1)?.type, {
      timeout: 40000,
    })
    .toBe("run_failed");
  expect((await state(page)).world.collected).toHaveLength(0);
});
