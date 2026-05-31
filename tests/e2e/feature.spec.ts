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

// Load-bearing cross-peer test: drive the advertised core action (write takes,
// react) from BOTH peers and read the result on the OPPOSITE peer. Covers two
// gaps the first test left open:
//  1. Bidirectional take propagation — a take written by peer B must appear in
//     peer A's writing list (the first test only sends A→B).
//  2. Scoreboard sync — the "done" phase ranking, which is the third leg of the
//     advertised feature, must reflect cross-peer reactions on BOTH peers.
test("takes from both peers sync, then scoreboard reflects cross-peer reactions", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(500);

    // Peer A writes a take.
    await a.getByPlaceholder("drop a hot take").fill("alice take");
    await a.getByRole("button", { name: "add take", exact: true }).click();
    // Peer B writes a take — the direction the first test never exercises.
    await b.getByPlaceholder("drop a hot take").fill("bob take");
    await b.getByRole("button", { name: "add take", exact: true }).click();
    await a.waitForTimeout(600);

    // Both peers must see BOTH takes in the shared event log.
    await expect(a.locator(".blitz-list")).toContainText("alice take");
    await expect(a.locator(".blitz-list")).toContainText("bob take");
    await expect(b.locator(".blitz-list")).toContainText("alice take");
    await expect(b.locator(".blitz-list")).toContainText("bob take");

    // Peer B starts the blitz; peer A must enter streaming (shared phase).
    await b.getByRole("button", { name: "start blitz", exact: true }).click();
    await a.waitForTimeout(600);
    await expect(a.locator(".blitz-current")).toBeVisible();

    // Whatever take is currently streaming, react to it on peer A and read the
    // text so we can assert the scoreboard ranks the SAME take on peer B.
    const reactedText = (await a.locator(".blitz-current").textContent())?.trim() ?? "";
    expect(reactedText.length).toBeGreaterThan(0);
    await a.getByRole("button", { name: "react rocket", exact: true }).click();
    await b.waitForTimeout(400);
    // The reaction made on peer A is visible in peer B's live tally.
    await expect(b.locator(".blitz-tally")).toHaveAttribute("data-rocket", "1");

    // End the blitz from peer A → peer B's phase flips to "done" and the
    // scoreboard there ranks the reacted take #1 with the cross-peer 🚀 count.
    await a.getByRole("button", { name: "end blitz" }).click();
    await b.waitForTimeout(500);
    await expect(b.locator(".blitz-board")).toBeVisible();
    const topRow = b.locator(".blitz-rank li").first();
    await expect(topRow).toContainText(reactedText);
    await expect(topRow).toContainText("🚀 1");
  } finally {
    await cleanup();
  }
});
