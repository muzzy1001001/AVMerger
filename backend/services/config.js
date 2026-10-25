import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
dotenv.config({ path: path.join(root, ".env"), quiet: true });
const positive = (key, fallback) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const config = {
  host: process.env.HOST || "127.0.0.1",
  port: positive("PORT", 3001),
  maxBytes: positive("MAX_UPLOAD_MB", 4096) * 1024 * 1024,
  retentionMs: positive("RETENTION_HOURS", 2) * 3600000,
  concurrency: positive("MAX_CONCURRENT_JOBS", 2),
  uploads: path.join(root, "backend/uploads"),
  outputs: path.join(root, "backend/outputs"),
};
for (const dir of [config.uploads, config.outputs])
  mkdirSync(dir, { recursive: true });
