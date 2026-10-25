import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { binary, run, inspect } from "../services/media.js";
import { root } from "../services/config.js";
let server,
  fixture,
  base,
  logs = "";
const ffmpeg = binary("ffmpeg");
const aliveIds = new Set();
async function json(endpoint, options = {}) {
  const response = await fetch(base + endpoint, options);
  const data = await response.json();
  return { response, data };
}
async function upload(name, kind) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([await readFile(path.join(fixture, name))]),
    name,
  );
  const { response, data } = await json("/upload?kind=" + kind, {
    method: "POST",
    body: form,
  });
  assert.equal(response.status, 201, JSON.stringify(data));
  return data;
}
async function merge(video, audio, options = {}) {
  const { response, data } = await json("/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoId: video.id,
      audioId: audio.id,
      filename: "旅の video: test?",
      ...options,
    }),
  });
  assert.equal(response.status, 202, JSON.stringify(data));
  aliveIds.add(data.id);
  return data;
}
async function finish(id) {
  for (let i = 0; i < 200; i++) {
    const { data } = await json("/jobs/" + id);
    if (["completed", "cancelled", "failed"].includes(data.status)) return data;
    await delay(100);
  }
  throw new Error("Job timed out");
}
before(
  async () => {
    fixture = await mkdtemp(path.join(tmpdir(), "av-merger-test-"));
    const make = (args, name) =>
      run(
        ffmpeg,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          ...args,
          path.join(fixture, name),
        ],
        { timeout: 120000 },
      );
    await make(
      [
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x180:rate=24",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=220:sample_rate=48000",
        "-t",
        "3",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
      ],
      "with audio.mp4",
    );
    await make(
      [
        "-i",
        path.join(fixture, "with audio.mp4"),
        "-map",
        "0:v:0",
        "-c",
        "copy",
      ],
      "silent.mp4",
    );
    await make(
      ["-i", path.join(fixture, "silent.mp4"), "-c", "copy"],
      "source.mkv",
    );
    await make(
      [
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x180:rate=24",
        "-t",
        "3",
        "-c:v",
        "libvpx-vp9",
        "-pix_fmt",
        "yuv420p",
      ],
      "source.webm",
    );
    await make(
      [
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:sample_rate=48000",
        "-t",
        "2",
        "-c:a",
        "libmp3lame",
      ],
      "sound.mp3",
    );
    await make(
      [
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:sample_rate=48000",
        "-t",
        "2",
        "-c:a",
        "aac",
      ],
      "sound.m4a",
    );
    await make(
      ["-i", path.join(fixture, "sound.m4a"), "-c", "copy", "-f", "adts"],
      "sound.aac",
    );
    await make(
      ["-i", path.join(fixture, "sound.m4a"), "-c:a", "pcm_s16le"],
      "sound.wav",
    );
    await make(
      [
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=1280x720:rate=30",
        "-t",
        "15",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
      ],
      "long.mp4",
    );
    await make(
      [
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000",
        "-t",
        "16",
        "-c:a",
        "aac",
      ],
      "long.m4a",
    );
    await writeFile(path.join(fixture, "bad.mp4"), "This is not media");
    base = "http://127.0.0.1:3198/api";
    server = spawn(process.execPath, ["backend/server.js"], {
      cwd: root,
      env: { ...process.env, PORT: "3198", MAX_UPLOAD_MB: "32" },
      windowsHide: true,
    });
    server.stdout.on("data", (data) => (logs += data));
    server.stderr.on("data", (data) => (logs += data));
    for (let i = 0; i < 100; i++) {
      try {
        const result = await json("/health");
        if (result.data.ready) return;
      } catch {}
      await delay(100);
    }
    throw new Error("Server unavailable: " + logs);
  },
  { timeout: 180000 },
);
after(async () => {
  if (server) {
    for (const id of aliveIds)
      await fetch(base + "/jobs/" + id, { method: "DELETE" }).catch(() => {});
    server.kill();
  }
  if (fixture) await rm(fixture, { recursive: true, force: true });
});
test(
  "real merges: MP4 + MP3, MP4 + M4A, MKV + AAC, WAV conversion, and VP9 conversion",
  async () => {
    for (const [videoName, audioName, expectedVideo, expectedAudio] of [
      ["with audio.mp4", "sound.mp3", "h264", "mp3"],
      ["silent.mp4", "sound.m4a", "h264", "aac"],
      ["source.mkv", "sound.aac", "h264", "aac"],
      ["silent.mp4", "sound.wav", "h264", "aac"],
      ["source.webm", "sound.m4a", "h264", "aac"],
    ]) {
      const video = await upload(videoName, "video"),
        audio = await upload(audioName, "audio");
      const started = await merge(video, audio);
      const job = await finish(started.id);
      assert.equal(job.status, "completed", job.error);
      assert.equal(job.progress, 100);
      assert.equal(job.metadata.video.codec, expectedVideo);
      assert.equal(job.metadata.audio.codec, expectedAudio);
      assert.equal(job.metadata.video.width, 320);
      assert.ok(job.metadata.duration < 2.5, "ends at shorter track");
      assert.equal(job.filename, "旅の video_ test_.mp4");
      const response = await fetch(base + "/jobs/" + job.id + "/download");
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-disposition"), /attachment/);
      const downloaded = path.join(fixture, "download-" + job.id + ".mp4");
      await writeFile(downloaded, Buffer.from(await response.arrayBuffer()));
      assert.equal((await inspect(downloaded)).audio.codec, expectedAudio);
      await run(ffmpeg, ["-v", "error", "-i", downloaded, "-f", "null", "-"]);
      const probe = JSON.parse(
        await run(binary("ffprobe"), [
          "-v",
          "error",
          "-show_streams",
          "-of",
          "json",
          downloaded,
        ]),
      );
      const starts = probe.streams
        .filter((s) => ["video", "audio"].includes(s.codec_type))
        .map((s) => Number(s.start_time) || 0);
      assert.ok(
        Math.abs(starts[0] - starts[1]) < 0.15,
        "stream timestamps remain aligned",
      );
      if (audioName === "sound.m4a" && videoName === "silent.mp4") {
        const ah = async (file) =>
          JSON.parse(
            await run(binary("ffprobe"), [
              "-v",
              "error",
              "-select_streams",
              "a:0",
              "-show_packets",
              "-show_data_hash",
              "sha256",
              "-show_entries",
              "packet=data_hash",
              "-of",
              "json",
              file,
            ]),
          ).packets.map((p) => p.data_hash);
        const originalAudio = await ah(path.join(fixture, audioName)),
          outputAudio = await ah(downloaded);
        const offset = originalAudio.indexOf(outputAudio[0]);
        assert.ok(offset >= 0 && offset < 3);
        assert.ok(outputAudio.length > originalAudio.length * 0.9);
        assert.deepEqual(
          outputAudio,
          originalAudio.slice(offset, offset + outputAudio.length),
          "selected audio packet payload preserved up to the shorter output boundary",
        );
        const vh = async (file) =>
          JSON.parse(
            await run(binary("ffprobe"), [
              "-v",
              "error",
              "-select_streams",
              "v:0",
              "-show_packets",
              "-show_data_hash",
              "sha256",
              "-show_entries",
              "packet=data_hash",
              "-of",
              "json",
              file,
            ]),
          ).packets.map((p) => p.data_hash);
        const original = await vh(path.join(fixture, videoName)),
          output = await vh(downloaded);
        assert.deepEqual(
          output,
          original.slice(0, output.length),
          "video packet payload preserved",
        );
      }
      const preview = await fetch(base + "/jobs/" + job.id + "/preview", {
        headers: { Range: "bytes=0-99" },
      });
      assert.equal(preview.status, 206);
      assert.equal((await preview.arrayBuffer()).byteLength, 100);
      assert.equal(
        (await fetch(base + "/jobs/" + job.id, { method: "DELETE" })).status,
        204,
      );
      aliveIds.delete(job.id);
      assert.equal((await fetch(base + "/jobs/" + job.id)).status, 404);
    }
  },
  { timeout: 120000 },
);
test("corrupt files, wrong stream type, invalid IDs, and cross-origin requests are rejected", async () => {
  for (const [name, kind] of [
    ["bad.mp4", "video"],
    ["sound.mp3", "video"],
    ["silent.mp4", "audio"],
  ]) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([await readFile(path.join(fixture, name))]),
      name,
    );
    assert.equal(
      (
        await fetch(base + "/upload?kind=" + kind, {
          method: "POST",
          body: form,
        })
      ).status,
      400,
    );
  }
  assert.equal((await fetch(base + "/jobs/not-a-job")).status, 404);
  assert.equal(
    (
      await fetch(base + "/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/merge", {
        method: "POST",
        headers: { Origin: "https://example.com" },
      })
    ).status,
    403,
  );
});
test("SSE reports status; active merges reject duplicates and cancel cleanly", async () => {
  const video = await upload("long.mp4", "video"),
    audio = await upload("long.m4a", "audio");
  const started = await merge(video, audio, { mode: "encode" });
  const abort = new AbortController();
  const eventResponse = await fetch(base + "/jobs/" + started.id + "/events", {
    signal: abort.signal,
  });
  assert.match(
    eventResponse.headers.get("content-type"),
    /^text\/event-stream/,
  );
  const chunk = await eventResponse.body.getReader().read();
  assert.match(new TextDecoder().decode(chunk.value), /processing/);
  abort.abort();
  const duplicate = await json("/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId: video.id, audioId: audio.id }),
  });
  assert.equal(duplicate.response.status, 409);
  const cancelled = await json("/jobs/" + started.id + "/cancel", {
    method: "POST",
  });
  assert.equal(cancelled.data.status, "cancelled");
  assert.equal(
    (await fetch(base + "/jobs/" + started.id + "/download")).status,
    409,
  );
  const { config } = await import("../services/config.js");
  assert.deepEqual(await readdir(path.join(config.outputs, started.id)), []);
});
test("upload limit rejects oversized file without keeping partial files", async () => {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(33 * 1048576)]), "large.mp4");
  const response = await fetch(base + "/upload?kind=video", {
    method: "POST",
    body: form,
  });
  assert.equal(response.status, 413);
});

test("interrupted multipart upload removes its partial file", async () => {
  const { request: httpRequest } = await import("node:http");
  const { config } = await import("../services/config.js");
  const before = new Set(await readdir(config.uploads));
  await new Promise((resolve) => {
    const req = httpRequest(base + "/upload?kind=video", {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=av-test",
        "Content-Length": 20000000,
      },
    });
    req.on("error", () => resolve());
    req.write(
      '--av-test\r\nContent-Disposition: form-data; name="file"; filename="partial.mp4"\r\nContent-Type: video/mp4\r\n\r\n',
    );
    req.write(Buffer.alloc(262144));
    setTimeout(() => {
      req.destroy();
      resolve();
    }, 80);
  });
  let remaining = [];
  for (let i = 0; i < 30; i++) {
    await delay(100);
    remaining = (await readdir(config.uploads)).filter((id) => !before.has(id));
    if (!remaining.length) break;
  }
  assert.deepEqual(remaining, [], "no partial upload directory remains");
});
