import { test, expect } from "@playwright/test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { binary, run } from "../backend/services/media.js";
let dir;
test.beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "av-ui-"));
  await mkdir(".qa", { recursive: true });
  await run(binary("ffmpeg"), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x180:rate=24",
    "-t",
    "3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    path.join(dir, "Summer in Kyoto.mp4"),
  ]);
  await run(binary("ffmpeg"), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880",
    "-t",
    "2",
    "-c:a",
    "aac",
    path.join(dir, "Soundtrack.m4a"),
  ]);
});
test.afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});
test("desktop upload, merge, preview, download and history", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Two files. One perfect match." }),
  ).toBeVisible();
  const workspace = page.getByRole("region", {
    name: "WORKSPACE 1",
    exact: true,
  });
  const merge = workspace.getByRole("button", {
    name: "Merge Video & Audio",
    exact: true,
  });
  await expect(merge).toBeDisabled();
  await page.screenshot({ path: ".qa/desktop.png", fullPage: true });
  await workspace
    .getByLabel("Choose video file")
    .setInputFiles(path.join(dir, "Summer in Kyoto.mp4"));
  await expect(
    workspace.getByRole("heading", { name: "Summer in Kyoto.mp4" }),
  ).toBeVisible();
  await expect(workspace.getByLabel("Output filename")).toHaveValue(
    "Summer in Kyoto",
  );
  await workspace
    .getByLabel("Choose audio file")
    .setInputFiles(path.join(dir, "Soundtrack.m4a"));
  await expect(
    workspace.getByRole("heading", { name: "Soundtrack.m4a" }),
  ).toBeVisible();
  await workspace.getByLabel("Output filename").fill("Kyoto: soundtrack?");
  await workspace.getByLabel("Video quality").selectOption("encode");
  await expect(merge).toBeEnabled();
  await merge.click();
  await expect(page.getByText("MERGE COMPLETE", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByText("Kyoto_ soundtrack_.mp4", { exact: true }).first(),
  ).toBeVisible();
  const resultVideo = page.locator(".result-card > video");
  await expect(resultVideo).toBeVisible();
  await expect
    .poll(() => resultVideo.evaluate((video) => video.readyState))
    .toBeGreaterThanOrEqual(1);
  await resultVideo.evaluate((video) => video.play());
  await expect
    .poll(() => resultVideo.evaluate((video) => video.currentTime))
    .toBeGreaterThan(0);
  await resultVideo.evaluate((video) => video.pause());
  await page.screenshot({ path: ".qa/completed.png", fullPage: true });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download MP4", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Kyoto_ soundtrack_.mp4");
  expect(await download.failure()).toBeNull();
  await page.getByRole("button", { name: "Merge another" }).click();
  await expect(merge).toBeDisabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete Kyoto_ soundtrack_.mp4" })
    .click();
  await expect(page.getByText("RECENT MERGES", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("mobile layout, theme control and invalid upload feedback", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const workspace = page.getByRole("region", {
    name: "WORKSPACE 1",
    exact: true,
  });
  await page.goto("/");
  await expect(
    workspace.getByRole("heading", { name: "Drop your video here" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(page.locator(".app")).toHaveClass("app light");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.screenshot({ path: ".qa/mobile.png", fullPage: true });
  await workspace.getByLabel("Choose video file").setInputFiles({
    name: "broken.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("not video"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("four workspaces keep files and settings independent", async ({
  page,
}) => {
  await page.goto("/");
  const spaces = [1, 2, 3, 4].map((n) =>
    page.getByRole("region", { name: "WORKSPACE " + n, exact: true }),
  );
  for (const space of spaces) {
    await expect(
      space.getByRole("button", { name: "Merge Video & Audio", exact: true }),
    ).toBeDisabled();
  }
  await spaces[3]
    .getByLabel("Choose video file")
    .setInputFiles(path.join(dir, "Summer in Kyoto.mp4"));
  await expect(
    spaces[3].getByRole("heading", { name: "Summer in Kyoto.mp4" }),
  ).toBeVisible();
  await spaces[3].getByLabel("Output filename").fill("Fourth workspace");
  await spaces[3].getByLabel("Video quality").selectOption("encode");
  for (const space of spaces.slice(0, 3)) {
    await expect(space.getByLabel("Output filename")).toHaveValue("");
    await expect(space.getByLabel("Video quality")).toHaveValue("auto");
  }
  await spaces[0].getByLabel("Output filename").fill("First workspace");
  await page.getByRole("link", { name: "04", exact: true }).click();
  await expect(spaces[3].getByLabel("Output filename")).toHaveValue(
    "Fourth workspace",
  );
  await expect(spaces[0].getByLabel("Output filename")).toHaveValue(
    "First workspace",
  );
  await spaces[3]
    .getByLabel("Choose audio file")
    .setInputFiles(path.join(dir, "Soundtrack.m4a"));
  await expect(
    spaces[3].getByRole("button", { name: "Merge Video & Audio", exact: true }),
  ).toBeEnabled();
  await spaces[3]
    .getByRole("button", { name: "Merge Video & Audio", exact: true })
    .click();
  await expect(
    spaces[3].getByText("MERGE COMPLETE", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  for (const space of spaces.slice(0, 3)) {
    await expect(
      space.getByRole("button", { name: "Merge Video & Audio", exact: true }),
    ).toBeDisabled();
  }
  await spaces[3].getByRole("button", { name: "Merge another" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await spaces[3]
    .getByRole("button", { name: "Delete Fourth workspace.mp4" })
    .click();
  await expect(
    spaces[3].getByText("RECENT MERGES", { exact: true }),
  ).toHaveCount(0);
});
