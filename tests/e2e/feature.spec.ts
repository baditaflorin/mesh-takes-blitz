import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("submit take → start → react → counts sync", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(500);

    await a.getByPlaceholder("drop a hot take").fill("ts is fine");
    await a.getByRole("button", { name: "add take", exact: true }).click();
    await a.waitForTimeout(300);

    await a.getByRole("button", { name: "start blitz", exact: true }).click();
    await b.waitForTimeout(500);

    await expect(b.locator(".blitz-current")).toContainText("ts is fine");
    await b.getByRole("button", { name: "react rocket", exact: true }).click();
    await a.waitForTimeout(400);
    await expect(a.locator(".blitz-tally")).toHaveAttribute("data-rocket", "1");
  } finally {
    await cleanup();
  }
});
