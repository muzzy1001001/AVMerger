import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeFilename, mergePlan } from "../services/media.js";
test("Windows filenames remain safe while preserving Unicode", () => {
  assert.equal(sanitizeFilename("../CON: demo?.mp4"), ".._CON_ demo_.mp4");
  assert.equal(sanitizeFilename("CON.mp4"), "_CON.mp4");
  assert.equal(sanitizeFilename("旅の思い出 2026.mp4"), "旅の思い出 2026.mp4");
  assert.equal(sanitizeFilename("  .  "), "merged-video.mp4");
  assert.ok(sanitizeFilename("x".repeat(300)).length <= 124);
});
test("codec plans preserve compatible streams and refuse impossible copy", () => {
  assert.equal(mergePlan({ codec: "h264" }, { codec: "aac" }).videoCopy, true);
  assert.equal(
    mergePlan({ codec: "h264" }, { codec: "pcm_s16le" }).audioCopy,
    false,
  );
  assert.equal(mergePlan({ codec: "vp9" }, { codec: "opus" }).videoCopy, false);
  assert.equal(
    mergePlan({ codec: "h264" }, { codec: "aac" }, "encode").videoCopy,
    false,
  );
  assert.throws(
    () => mergePlan({ codec: "vp9" }, { codec: "aac" }, "copy"),
    /needs conversion/,
  );
});
