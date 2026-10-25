import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { config } from "../services/config.js";
import { inspect, binary, run } from "../services/media.js";
import {
  uploads,
  jobs,
  publicJob,
  createJob,
  cancel,
  removeJob,
  freeSpace,
} from "../services/jobs.js";
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, req.uploadDir),
  filename: (req, file, cb) => cb(null, "media"),
});
const receive = multer({
  storage,
  limits: { fileSize: config.maxBytes, files: 1, fields: 2, parts: 3 },
}).single("file");
export async function upload(req, res, next) {
  const id = randomUUID();
  req.uploadDir = path.join(config.uploads, id);
  try {
    if (!["video", "audio"].includes(req.query.kind))
      throw Object.assign(new Error("Specify video or audio upload."), {
        status: 400,
      });
    await freeSpace(104857600);
    await mkdir(req.uploadDir, { recursive: true });
    receive(req, res, async (error) => {
      try {
        if (error) throw error;
        if (req.aborted || !req.file)
          throw Object.assign(
            new Error("Upload interrupted or no file received."),
            { status: 400 },
          );
        const metadata = await inspect(req.file.path),
          kind = req.query.kind;
        if (!metadata[kind])
          throw Object.assign(
            new Error(
              "This file does not contain a valid " + kind + " stream.",
            ),
            { status: 400 },
          );
        // Multer receives multipart names as latin1; normalize UTF-8 browser filenames.
        const rawName = req.file.originalname;
        const name = Buffer.from(rawName, "latin1").toString("utf8");
        const filename = name.includes("\uFFFD") ? rawName : name;
        const item = {
          id,
          kind,
          path: req.file.path,
          name: filename,
          size: req.file.size,
          metadata,
          touchedAt: Date.now(),
        };
        uploads.set(id, item);
        res
          .status(201)
          .json({ id, kind, name: filename, size: item.size, metadata });
      } catch (error) {
        await rm(req.uploadDir, { recursive: true, force: true }).catch(
          () => {},
        );
        next(error);
      }
    });
  } catch (error) {
    await rm(req.uploadDir, { recursive: true, force: true }).catch(() => {});
    next(error);
  }
}
export const start = async (req, res) =>
  res.status(202).json(publicJob(await createJob(req.body)));
export function findJob(req, res, next) {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found or expired." });
  req.job = job;
  next();
}
export const status = (req, res) => res.json(publicJob(req.job));
export function events(req, res) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  req.job.clients.add(res);
  res.write("data: " + JSON.stringify(publicJob(req.job)) + "\n\n");
  const timer = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  res.on("close", () => {
    clearInterval(timer);
    req.job.clients.delete(res);
  });
}
export const stop = async (req, res) => {
  await cancel(req.job);
  res.json(publicJob(req.job));
};
export const remove = async (req, res) => {
  await removeJob(req.job);
  res.status(204).end();
};
export function sendOutput(req, res, next) {
  const job = req.job;
  if (job.status !== "completed")
    return res.status(409).json({ error: "Output is not ready." });
  job.readers++;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      job.readers--;
    }
  };
  res.on("finish", release);
  res.on("close", release);
  res.set("Cache-Control", "private, no-store");
  const callback = (error) => {
    if (error && !res.headersSent) next(error);
  };
  if (req.path.endsWith("/download"))
    res.download(job.output, job.filename, callback);
  else res.sendFile(job.output, callback);
}
export async function health(req, res) {
  const checks = await Promise.allSettled(
    ["ffmpeg", "ffprobe"].map((name) =>
      run(binary(name), ["-version"], { timeout: 10000 }),
    ),
  );
  res.json({
    ready: checks.every((c) => c.status === "fulfilled"),
    tools: checks.map((c, i) => ({
      name: ["ffmpeg", "ffprobe"][i],
      available: c.status === "fulfilled",
    })),
    maxUploadMB: config.maxBytes / 1048576,
    retentionHours: config.retentionMs / 3600000,
  });
}
