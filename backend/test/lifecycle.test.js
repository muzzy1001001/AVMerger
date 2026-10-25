import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  access,
  rm,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { config } from "../services/config.js";
import { jobs, uploads, cleanup, removeJob } from "../services/jobs.js";
test("retention protects active readers, removes expired jobs and uploads, and reclaims stale orphans", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "av-retention-"));
  const original = { uploads: config.uploads, outputs: config.outputs };
  config.uploads = path.join(dir, "uploads");
  config.outputs = path.join(dir, "outputs");
  await mkdir(config.uploads);
  await mkdir(config.outputs);
  try {
    const age = Date.now() - config.retentionMs - 10000;
    const items = [];
    for (const kind of ["video", "audio"]) {
      const id = randomUUID(),
        folder = path.join(config.uploads, id);
      await mkdir(folder);
      const file = path.join(folder, "media");
      await writeFile(file, "fixture");
      const item = { id, kind, path: file, touchedAt: age };
      items.push(item);
      uploads.set(id, item);
    }
    const id = randomUUID(),
      outputDir = path.join(config.outputs, id);
    await mkdir(outputDir);
    const output = path.join(outputDir, "result.mp4");
    await writeFile(output, "fixture");
    const job = {
      id,
      video: items[0],
      audio: items[1],
      status: "completed",
      createdAt: age,
      finishedAt: age,
      output,
      readers: 1,
      clients: new Set(),
    };
    jobs.set(id, job);
    await cleanup();
    await access(output);
    await assert.rejects(() => removeJob(job), /being streamed or downloaded/);
    job.readers = 0;
    await cleanup();
    assert.equal(jobs.size, 0);
    assert.equal(uploads.size, 0);
    await assert.rejects(() => access(output));
    for (const item of items) await assert.rejects(() => access(item.path));
    const stale = path.join(config.uploads, randomUUID()),
      fresh = path.join(config.outputs, randomUUID());
    await mkdir(stale);
    await mkdir(fresh);
    await utimes(stale, new Date(age), new Date(age));
    await cleanup();
    await assert.rejects(() => access(stale));
    await access(fresh);
  } finally {
    jobs.clear();
    uploads.clear();
    Object.assign(config, original);
    await rm(dir, { recursive: true, force: true });
  }
});
