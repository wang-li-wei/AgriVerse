import { test, expect } from "@playwright/test";

test("任务与事件在刷新/断流后可查询，恢复同 Mission 必须重新确认", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".start-task")).toBeEnabled();
  await page.locator(".start-task").click();
  await expect(page.getByTestId("confirmation-card")).toBeVisible();
  const sid = await page.evaluate(() => sessionStorage.getItem("agriverse-session"));
  const endpoint = `/api/sessions/${sid}`;
  const initial = await (await page.request.get(`${endpoint}/missions`)).json();
  const mid = initial.current_mission_id;
  const version = initial.pending.plan_version;
  await page.reload();
  await expect(page.getByTestId("confirmation-card")).toBeVisible();
  await expect(page.getByTestId("execution-timeline")).toContainText(mid.slice(0, 8));
  const started = page.waitForRequest((request) => request.url().endsWith("/stage") && request.method() === "POST" && request.postDataJSON().index === 0);
  await page.getByRole("button", { name: "确认并模拟采摘" }).click();
  await started; // Actual first-frame stage feedback; disconnect before separation.
  await page.reload(); // Closes the NDJSON stream before separation.
  await expect.poll(async () => (await (await page.request.get(`${endpoint}/missions/${mid}`)).json()).status).toBe("cancelled");
  const state = await (await page.request.get(endpoint)).json();
  expect(state.collected).toEqual([]);
  const saved = await (await page.request.get(`${endpoint}/events?mission_id=${mid}`)).json();
  expect(saved.events.at(-1).type).toBe("run_failed");
  expect(saved.events.at(-1).mission_id).toBe(mid);
  await page.reload();
  await expect(page.getByTestId("execution-timeline")).toContainText("执行未成功");
  await page.getByRole("button", { name: "重新观察并恢复任务（操作需重新确认）" }).click();
  await expect(page.getByTestId("confirmation-card")).toBeVisible();
  const resumed = await (await page.request.get(`${endpoint}/missions`)).json();
  expect(resumed.current_mission_id).toBe(mid);
  expect(resumed.pending.plan_version).toBe(version + 1);
  expect((await (await page.request.get(endpoint)).json()).collected).toEqual([]);
});
