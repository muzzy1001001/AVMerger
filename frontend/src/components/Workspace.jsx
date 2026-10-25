import { useEffect, useState } from "react";
import {
  Layers2,
  ArrowRight,
  ArrowDownToLine,
  ShieldCheck,
  Zap,
  SlidersHorizontal,
  ChevronDown,
  Check,
  LoaderCircle,
  AlertCircle,
  X,
  Plus,
  Clock3,
  Sun,
  Moon,
  RotateCcw,
  Trash2,
  Headphones,
  Film,
} from "lucide-react";
import UploadCard from "./UploadCard";
import useJob from "../hooks/useJob";
import { request, bytes, duration, cleanName } from "../services/api";
export default function Workspace({ number, health }) {
  const [video, setVideo] = useState(null),
    [audio, setAudio] = useState(null),
    [filename, setFilename] = useState(""),
    [mode, setMode] = useState("auto"),
    [id, setId] = useState(null),
    [starting, setStarting] = useState(false),
    [busy, setBusy] = useState({ video: false, audio: false }),
    [notice, setNotice] = useState(""),
    [recent, setRecent] = useState([]),
    [now, setNow] = useState(Date.now());
  const job = useJob(id),
    completed = job?.status === "completed",
    running =
      starting ||
      (!!id && (!job || ["processing", "verifying"].includes(job.status))),
    locked = running || completed;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 9000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (job?.status === "completed")
      setRecent((items) =>
        [{ ...job }, ...items.filter((item) => item.id !== job.id)].slice(0, 8),
      );
    if (job?.status === "failed") setNotice(job.error);
  }, [job?.status]);
  const vd = video?.metadata.video?.duration || 0,
    ad = audio?.metadata.audio?.duration || 0,
    target = Math.min(vd, ad),
    difference = Math.abs(vd - ad);
  function chooseVideo(file) {
    setVideo(file);
    if (file) setFilename(cleanName(file.name.replace(/\.[^.]+$/, "")));
    if (id) setId(null);
  }
  async function merge() {
    if (running || !video || !audio) return;
    setStarting(true);
    setNotice("");
    try {
      const next = await request("/merge", {
        method: "POST",
        body: JSON.stringify({
          videoId: video.id,
          audioId: audio.id,
          filename: cleanName(filename),
          mode,
        }),
      });
      setId(next.id);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setStarting(false);
    }
  }
  async function cancel() {
    try {
      await request("/jobs/" + id + "/cancel", { method: "POST" });
    } catch (error) {
      setNotice(error.message);
    }
  }
  function reset() {
    setId(null);
    setVideo(null);
    setAudio(null);
    setFilename("");
    setMode("auto");
  }
  async function deleteRecent(item) {
    if (
      !window.confirm(
        "Delete “" +
          item.filename +
          "” and its temporary files? This cannot be undone.",
      )
    )
      return;
    try {
      await request("/jobs/" + item.id, { method: "DELETE" });
      setRecent((items) => items.filter((j) => j.id !== item.id));
      if (item.id === id) reset();
    } catch (error) {
      setNotice(error.message);
    }
  }
  const estimate =
    video && audio
      ? Math.round(video.size * (target / vd) + audio.size * (target / ad))
      : 0;
  return (
    <section
      id={`workspace-${number}`}
      className="workspace-panel"
      aria-labelledby={`workspace-${number}-heading`}
    >
      <div className="workspace-label">
        <h2 id={`workspace-${number}-heading`}>WORKSPACE {number}</h2>
        <span>Video + audio, made simple</span>
      </div>
      {!completed ? (
        <>
          <div className="upload-grid">
            <UploadCard
              kind="video"
              value={video}
              onChange={chooseVideo}
              disabled={locked}
              onError={setNotice}
              onBusy={(value) => setBusy((b) => ({ ...b, video: value }))}
              maxMB={health?.maxUploadMB || 4096}
            />
            <div className="connector">
              <Plus size={19} />
            </div>
            <UploadCard
              kind="audio"
              value={audio}
              onChange={(file) => {
                setAudio(file);
                if (id) setId(null);
              }}
              disabled={locked}
              onError={setNotice}
              onBusy={(value) => setBusy((b) => ({ ...b, audio: value }))}
              maxMB={health?.maxUploadMB || 4096}
            />
          </div>
          {video && audio && difference > Math.max(2, target * 0.05) && (
            <div className="banner">
              <Clock3 size={17} />
              <div>
                Different durations: video {duration(vd)}, audio {duration(ad)}.
                Your output will end at the shorter track ({duration(target)}).
              </div>
            </div>
          )}
          <section className="settings-card">
            <div className="settings-title">
              <SlidersHorizontal size={17} />
              <h2>Make it yours</h2>
              <span>OUTPUT SETTINGS</span>
            </div>
            <div className="settings-grid">
              <div>
                <label htmlFor={`filename-${number}`}>Output filename</label>
                <div className="filename-input">
                  <input
                    id={`filename-${number}`}
                    placeholder="your-next-great-video"
                    value={filename}
                    onChange={(event) => setFilename(event.target.value)}
                    onBlur={() => filename && setFilename(cleanName(filename))}
                    disabled={locked}
                  />
                  <span>.mp4</span>
                </div>
                <small>
                  Windows-safe filenames. Spaces and Unicode welcome.
                </small>
              </div>
              <div>
                <label htmlFor={`quality-${number}`}>Video quality</label>
                <div className="select-wrap">
                  <select
                    id={`quality-${number}`}
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
                    disabled={locked}
                  >
                    <option value="auto">
                      Preserve quality · auto compatibility
                    </option>
                    <option value="copy">
                      Preserve video · no video conversion
                    </option>
                    <option value="encode">
                      Convert to H.264 · widest compatibility
                    </option>
                  </select>
                  <ChevronDown size={15} />
                </div>
                <small>
                  Auto copies compatible streams and converts when needed.
                </small>
              </div>
            </div>
            <div className="output-summary">
              <span>
                <Film size={14} /> MP4 output
              </span>
              <span>
                <Headphones size={14} /> Uploaded audio replaces original
              </span>
              <span>
                <Clock3 size={14} /> End at shortest track
              </span>
              {estimate > 0 && (
                <span>
                  ≈ {bytes(estimate)}{" "}
                  {mode === "encode" ? "before conversion" : "estimated"}
                </span>
              )}
            </div>
          </section>
          {running ? (
            <section className="processing-card" aria-live="polite">
              <div className="processing-heading">
                <LoaderCircle size={22} className="spin" />
                <div>
                  <h3>
                    {job?.status === "verifying"
                      ? "One final check…"
                      : "Bringing it together…"}
                  </h3>
                  <p>{job?.message || "Starting your merge"}</p>
                </div>
                <strong>{job?.progress || 0}%</strong>
              </div>
              <progress max="100" value={job?.progress || 0} />
              <div className="processing-footer">
                <span>
                  {job
                    ? duration(
                        Math.max(
                          job.elapsed || 0,
                          Math.round((now - job.createdAt) / 1000),
                        ),
                      )
                    : "00:00"}{" "}
                  elapsed · Keep this tab open
                </span>
                <button
                  className="text-button"
                  onClick={cancel}
                  disabled={!job}
                >
                  Cancel processing
                </button>
              </div>
            </section>
          ) : (
            <>
              <button
                className="merge-button"
                onClick={merge}
                disabled={
                  !video || !audio || busy.video || busy.audio || !health?.ready
                }
              >
                <Layers2 size={19} /> Merge Video &amp; Audio{" "}
                <ArrowRight size={18} />
              </button>
              <p className="merge-hint">
                {job?.status === "cancelled"
                  ? "Merge cancelled. Your source files are ready to try again."
                  : job?.status === "failed"
                    ? "Merge failed. Check the message, adjust settings, and try again."
                    : "No uploads to the cloud. No watermarks. Just your video."}
              </p>
            </>
          )}
        </>
      ) : (
        <section className="result-card">
          <div className="success-label">
            <span>
              <Check size={19} />
            </span>
            MERGE COMPLETE
          </div>
          <h2>
            A new soundtrack.
            <br />A whole new video.
          </h2>
          <p>Your files are now one. Take a look, then take it with you.</p>
          <video
            controls
            src={"/api/jobs/" + id + "/preview"}
            preload="metadata"
            onError={() =>
              setNotice(
                "Your browser may not support this copied codec. Download the MP4 to play it, or merge again using H.264 for wider compatibility.",
              )
            }
          />
          <div className="result-details">
            <div>
              <strong>{job.filename}</strong>
              <p>
                {bytes(job.size)} · {job.metadata.video.width} ×{" "}
                {job.metadata.video.height} · {duration(job.metadata.duration)}
              </p>
            </div>
            <span className="format-pill">MP4</span>
          </div>
          <div className="result-actions">
            <a
              className="merge-button"
              href={"/api/jobs/" + id + "/download"}
              download
            >
              <ArrowDownToLine size={18} /> Download MP4
            </a>
            <button className="secondary-button" onClick={reset}>
              <RotateCcw size={16} /> Merge another
            </button>
          </div>
          <small>
            Available for {health?.retentionHours || 2} hours. Download before
            closing your local server.
          </small>
        </section>
      )}
      {recent.length > 0 && (
        <section className="recent">
          <div className="workspace-label">
            <span>RECENT MERGES</span>
            <span>This session</span>
          </div>
          {recent.map((item) => (
            <div className="recent-row" key={item.id}>
              <span className="recent-icon">
                <Check size={17} />
              </span>
              <div>
                <strong>{item.filename}</strong>
                <small>
                  {bytes(item.size)} · {duration(item.metadata.duration)}
                </small>
              </div>
              <a
                className="icon-button"
                href={"/api/jobs/" + item.id + "/download"}
                aria-label={"Download " + item.filename}
              >
                <ArrowDownToLine size={17} />
              </a>
              <button
                className="icon-button"
                aria-label={"Delete " + item.filename}
                onClick={() => deleteRecent(item)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </section>
      )}
      {notice && (
        <div className="workspace-notice" role="alert">
          <AlertCircle size={19} />
          <span>{notice}</span>
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={17} />
          </button>
        </div>
      )}
    </section>
  );
}
