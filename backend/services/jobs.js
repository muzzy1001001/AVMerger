import { randomUUID } from "node:crypto";
import { mkdir, rm, stat, statfs, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "./config.js";
import {
  binary,
  inspect,
  mergePlan,
  mergeArgs,
  sanitizeFilename,
} from "./media.js";
export const uploads = new Map(),
  jobs = new Map();
let creationQueue = Promise.resolve();
export function createJob(input) {
  const task = creationQueue.then(() => createJobLocked(input));
  creationQueue = task.catch(() => {});
  return task;
}
export const publicJob = (job) => ({
  id: job.id,
  status: job.status,
  progress: job.progress,
  message: job.message,
  error: job.error,
  filename: job.filename,
  createdAt: job.createdAt,
  elapsed: Math.round(((job.finishedAt || Date.now()) - job.startedAt) / 1000),
  metadata: job.metadata,
  size: job.size,
  plan: job.plan?.description,
});
export function publish(job) {
  for (const client of job.clients)
    client.write("data: " + JSON.stringify(publicJob(job)) + "\n\n");
}
export async function freeSpace(required) {
  try {
    const disk = await statfs(config.outputs);
    if (Number(disk.bavail) * Number(disk.bsize) < required)
      throw Object.assign(
        new Error("Insufficient disk space. Free some space and try again."),
        { status: 507 },
      );
  } catch (error) {
    if (error.status === 507) throw error;
  }
}
async function createJobLocked({ videoId, audioId, filename, mode = "auto" }) {
  if (!["auto", "copy", "encode"].includes(mode))
    throw Object.assign(new Error("Invalid processing mode."), { status: 400 });
  const video = uploads.get(videoId),
    audio = uploads.get(audioId);
  if (!video || video.kind !== "video" || !audio || audio.kind !== "audio")
    throw Object.assign(
      new Error("Upload a valid video and audio file first."),
      { status: 400 },
    );
  if (
    [...jobs.values()].some(
      (j) =>
        ["processing", "verifying"].includes(j.status) &&
        [j.video.id, j.audio.id].some((id) => [videoId, audioId].includes(id)),
    )
  )
    throw Object.assign(new Error("These files are already being processed."), {
      status: 409,
    });
  if (
    [...jobs.values()].filter((j) =>
      ["processing", "verifying"].includes(j.status),
    ).length >= config.concurrency
  )
    throw Object.assign(
      new Error("All processing slots are busy. Try again shortly."),
      { status: 429 },
    );
  const plan = mergePlan(video.metadata.video, audio.metadata.audio, mode);
  await freeSpace(
    (video.size + audio.size) * (plan.videoCopy ? 1.2 : 3) + 104857600,
  );
  const id = randomUUID(),
    dir = path.join(config.outputs, id);
  await mkdir(dir, { recursive: true });
  const job = {
    id,
    video,
    audio,
    plan,
    filename: sanitizeFilename(filename),
    output: path.join(dir, "result.mp4"),
    status: "processing",
    progress: 0,
    message: plan.description,
    createdAt: Date.now(),
    startedAt: Date.now(),
    duration: Math.min(
      video.metadata.video.duration,
      audio.metadata.audio.duration,
    ),
    clients: new Set(),
    readers: 0,
  };
  jobs.set(id, job);
  video.touchedAt = audio.touchedAt = Date.now();
  const child = spawn(binary("ffmpeg"), mergeArgs(job), {
    windowsHide: true,
    shell: false,
  });
  job.child = child;
  let stderr = "",
    buffer = "";
  child.stderr.on("data", (data) => {
    stderr = (stderr + data).slice(-5000);
  });
  child.stdout.on("data", (data) => {
    buffer += data;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines)
      if (line.startsWith("out_time_us=")) {
        const seconds = Number(line.slice(12)) / 1000000;
        if (Number.isFinite(seconds))
          job.progress = Math.max(
            job.progress,
            Math.min(99, Math.round((seconds / job.duration) * 100)),
          );
        publish(job);
      }
  });
  child.on("error", (error) => {
    job.status = "failed";
    job.error =
      error.code === "ENOENT"
        ? "FFmpeg is missing. See README for installation instructions."
        : error.message;
    job.finishedAt = Date.now();
    publish(job);
  });
  job.settled = new Promise((resolve) =>
    child.on("close", async (code) => {
      job.child = null;
      try {
        if (job.cancelRequested) {
          job.status = "cancelled";
          job.message = "Processing cancelled";
          await rm(job.output, { force: true });
        } else if (code !== 0) {
          job.status = "failed";
          job.error = stderr.includes("No space left")
            ? "Insufficient disk space."
            : stderr || job.error || "FFmpeg could not process these files.";
          await rm(job.output, { force: true });
        } else {
          job.status = "verifying";
          job.message = "Verifying video and audio streams";
          publish(job);
          const metadata = await inspect(job.output);
          if (!metadata.video || !metadata.audio)
            throw new Error(
              "Output verification failed: both video and audio are required.",
            );
          if (job.cancelRequested) {
            job.status = "cancelled";
            job.message = "Processing cancelled";
            await rm(job.output, { force: true });
          } else {
            job.metadata = metadata;
            job.size = (await stat(job.output)).size;
            job.status = "completed";
            job.progress = 100;
            job.message = "Your MP4 is ready";
          }
        }
      } catch (error) {
        job.status = "failed";
        job.error = error.message;
        await rm(job.output, { force: true }).catch(() => {});
      }
      job.finishedAt = Date.now();
      publish(job);
      resolve();
    }),
  );
  return job;
}
export async function cancel(job) {
  if (["processing", "verifying"].includes(job.status)) {
    job.cancelRequested = true;
    job.message = "Cancelling…";
    publish(job);
    job.child?.kill("SIGTERM");
    await job.settled;
  }
}
export async function removeJob(job) {
  if (job.readers)
    throw Object.assign(
      new Error(
        "This output is being streamed or downloaded. Try again when it finishes.",
      ),
      { status: 409 },
    );
  await cancel(job);
  for (const client of job.clients) client.end();
  jobs.delete(job.id);
  await rm(path.dirname(job.output), { recursive: true, force: true });
  for (const item of [job.video, job.audio]) {
    if (
      ![...jobs.values()].some(
        (other) => other.video.id === item.id || other.audio.id === item.id,
      )
    ) {
      uploads.delete(item.id);
      await rm(path.dirname(item.path), { recursive: true, force: true });
    }
  }
}
export async function cleanup() {
  const now = Date.now();
  for (const job of jobs.values())
    if (
      !["processing", "verifying"].includes(job.status) &&
      !job.readers &&
      now - (job.finishedAt || job.createdAt) > config.retentionMs
    )
      await removeJob(job);
  for (const item of uploads.values())
    if (
      now - item.touchedAt > config.retentionMs &&
      ![...jobs.values()].some(
        (job) => job.video.id === item.id || job.audio.id === item.id,
      )
    ) {
      uploads.delete(item.id);
      await rm(path.dirname(item.path), { recursive: true, force: true });
    }
  // Orphaned directories from previous server sessions are reclaimed after retention.
  for (const base of [config.uploads, config.outputs])
    for (const entry of await readdir(base, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        !/^[0-9a-f-]{36}$/.test(entry.name) ||
        uploads.has(entry.name) ||
        jobs.has(entry.name)
      )
        continue;
      const dir = path.join(base, entry.name);
      if (now - (await stat(dir)).mtimeMs > config.retentionMs)
        await rm(dir, { recursive: true, force: true });
    }
}
