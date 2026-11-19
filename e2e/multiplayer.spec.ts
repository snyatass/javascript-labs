import { expect, test } from "@playwright/test";

test("two browsers join, chat and receive canvases", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const pageA = await first.newPage();
  const pageB = await second.newPage();

  await pageA.goto("/");
  await pageB.goto("/");
  await pageA.getByLabel("Pilot name").fill("Pilot A");
  await pageB.getByLabel("Pilot name").fill("Pilot B");
  await pageA.locator("#room-select").selectOption("arena-alpha");
  await pageB.locator("#room-select").selectOption("arena-alpha");
  await pageA.getByRole("button", { name: "Join" }).click();
  await pageB.getByRole("button", { name: "Join" }).click();

  await expect(pageA.locator("#chat")).toBeVisible();
  await expect(pageB.locator("#chat")).toBeVisible();
  await pageA.locator("#chat-input").fill("hello from A");
  await pageA.locator("#chat-form").press("Enter");
  await expect(pageB.locator("#chat-log")).toContainText("Pilot A: hello from A");

  await pageA.keyboard.down("ArrowRight");
  await pageA.waitForTimeout(500);
  await pageA.keyboard.up("ArrowRight");
  await expect(pageA.locator("canvas")).toBeVisible();
  await expect(pageB.locator("canvas")).toBeVisible();

  await first.close();
  await second.close();
});
