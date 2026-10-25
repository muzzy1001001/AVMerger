import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { root } from "./config.js";
export function binary(name) {
  if (process.env[name.toUpperCase() + "_PATH"])
    return process.env[name.toUpperCase() + "_PATH"];
  for (const folder of (process.env.PATH || "").split(path.delimiter)) {
    const candidate = path.join(
      folder,
      name + (process.platform === "win32" ? ".exe" : ""),
    );
    if (existsSync(candidate)) return candidate;
  }
  const tools = path.join(root, ".tools");
  if (existsSync(tools))
    for (const entry of readdirSync(tools)) {
      const candidate = path.join(tools, entry, "bin", name + ".exe");
      if (existsSync(candidate)) return candidate;
    }
  try {
    return require.resolve(
      name === "ffmpeg"
        ? "@ffmpeg-installer/win32-x64/ffmpeg.exe"
        : "@ffprobe-installer/win32-x64/ffprobe.exe",
    );
  } catch {}
  return name;
}
export function run(command, args, { timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false });
    let stdout = "",
      stderr = "",
      done = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("Media inspection timed out."));
    }, timeout);
    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(stdout);
    }
    child.on("error", () =>
      finish(
        new Error(
          command +
            " is unavailable. Install FFmpeg and FFprobe or set their paths in .env.",
        ),
      ),
    );
    child.stdout.on("data", (data) => {
      stdout += data;
      if (stdout.length > 4 * 1024 * 1024) {
        child.kill();
        finish(new Error("Media metadata exceeds the supported limit."));
      }
    });
    child.stderr.on("data", (data) => {
      stderr = (stderr + data).slice(-6000);
    });
    child.on("close", (code) =>
      finish(
        code === 0
          ? null
          : new Error(
              stderr ||
                "Unable to read media. The file may be invalid or corrupted.",
            ),
      ),
    );
  });
}
export async function inspect(file) {
  const result = JSON.parse(
    await run(binary("ffprobe"), [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ]),
  );
  const video = result.streams.find(
    (s) => s.codec_type === "video" && !s.disposition?.attached_pic,
  );
  const audio = result.streams.find((s) => s.codec_type === "audio");
  const duration =
    Number(result.format.duration) ||
    Number(video?.duration) ||
    Number(audio?.duration) ||
    0;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("This file has no readable finite duration.");
  return {
    duration,
    video: video
      ? {
          codec: video.codec_name,
          width: video.width,
          height: video.height,
          index: video.index,
          duration: Number(video.duration) || duration,
        }
      : null,
    audio: audio
      ? {
          codec: audio.codec_name,
          channels: audio.channels,
          index: audio.index,
          duration: Number(audio.duration) || duration,
        }
      : null,
  };
}
export function sanitizeFilename(value) {
  let name = String(value || "merged-video")
    .replace(/\.mp4$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 120)
    .replace(/[. ]+$/g, "");
  if (!name) name = "merged-video";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    name = "_" + name;
  return name + ".mp4";
}
export function mergePlan(video, audio, mode = "auto") {
  const compatible = ["h264", "hevc", "mpeg4", "av1"].includes(video.codec);
  if (mode === "copy" && !compatible)
    throw new Error(
      "This video codec needs conversion. Choose automatic compatibility or H.264.",
    );
  const videoCopy = mode !== "encode" && compatible;
  const audioCopy = ["aac", "mp3", "alac"].includes(audio.codec);
  return {
    videoCopy,
    audioCopy,
    description: videoCopy
      ? audioCopy
        ? "Copying video and audio without re-encoding"
        : "Preserving video · converting audio to AAC"
      : "Converting to H.264 and AAC",
  };
}
export function mergeArgs(job) {
  const { video, audio, plan } = job;
  return [
    "-hide_banner",
    "-nostdin",
    "-n",
    "-loglevel",
    "warning",
    "-i",
    video.path,
    "-i",
    audio.path,
    "-map",
    "0:" + video.metadata.video.index,
    "-map",
    "1:" + audio.metadata.audio.index,
    "-map_metadata",
    "-1",
    "-c:v",
    plan.videoCopy ? "copy" : "libx264",
    ...(!plan.videoCopy
      ? [
          "-crf",
          "18",
          "-preset",
          "medium",
          "-pix_fmt",
          "yuv420p",
          "-vf",
          "pad=ceil(iw/2)*2:ceil(ih/2)*2",
        ]
      : []),
    "-c:a",
    plan.audioCopy && plan.videoCopy ? "copy" : "aac",
    ...(!(plan.audioCopy && plan.videoCopy) ? ["-b:a", "192k"] : []),
    "-shortest",
    "-t",
    String(job.duration),
    "-avoid_negative_ts",
    "make_zero",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    job.output,
  ];
}
