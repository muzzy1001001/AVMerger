import { useRef, useState, useEffect } from "react";
import {
  Film,
  Music2,
  Upload,
  Check,
  ArrowUpRight,
  X,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { upload, bytes, duration } from "../services/api";
export default function UploadCard({
  kind,
  value,
  onChange,
  disabled,
  onError,
  onBusy,
  maxMB,
}) {
  const input = useRef(),
    controller = useRef(),
    [drag, setDrag] = useState(false),
    [progress, setProgress] = useState(null),
    [localUrl, setLocalUrl] = useState(null);
  const video = kind === "video",
    Icon = video ? Film : Music2;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(
    () => () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    },
    [localUrl],
  );
  async function select(file) {
    if (!file || disabled || progress !== null) return;
    if (file.size > maxMB * 1048576) {
      onError("File exceeds the " + maxMB + " MB upload limit.");
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setProgress(0);
    onBusy(true);
    try {
      const result = await upload(file, kind, setProgress, abort.signal);
      onChange(result);
      setLocalUrl(URL.createObjectURL(file));
    } catch (error) {
      if (error.name !== "AbortError") onError(error.message);
    } finally {
      setProgress(null);
      onBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  function remove() {
    onChange(null);
    setLocalUrl(null);
  }
  const metadata = value?.metadata,
    stream = metadata?.[kind];
  return (
    <section
      className={
        "upload-card " + (drag ? "dragging " : "") + (value ? "has-file" : "")
      }
      aria-label={kind + " file"}
    >
      <div className="card-heading">
        <span className={"file-icon " + kind}>
          <Icon size={20} />
        </span>
        <h2>{video ? "Video source" : "Audio track"}</h2>
        <span className="step-number">0{video ? "1" : "2"}</span>
      </div>
      <div
        className="dropzone"
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          select(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={input}
          type="file"
          className="sr-only"
          aria-label={"Choose " + kind + " file"}
          accept={
            video
              ? "video/*,.mkv,.avi,.mxf,.ts,.m2ts,.flv,.vob"
              : "audio/*,.aac,.flac,.m4a,.opus,.aiff,.ac3,.ogg"
          }
          onChange={(event) => select(event.target.files[0])}
          disabled={disabled || progress !== null}
        />
        {progress !== null ? (
          <div className="uploading">
            <LoaderCircle className="spin" size={30} />
            <h3>
              {progress === 100
                ? "Inspecting your file…"
                : "Uploading " + kind + "…"}
            </h3>
            <p>
              {progress === 100
                ? "Checking streams with FFprobe"
                : progress + "% transferred"}
            </p>
            <progress value={progress} max="100" />
            <button
              className="text-button"
              onClick={() => controller.current?.abort()}
            >
              Cancel upload
            </button>
          </div>
        ) : value ? (
          <div className="selected-file">
            <div className="media-preview">
              {video ? (
                <video src={localUrl || undefined} muted preload="metadata" />
              ) : (
                <>
                  <div className="waveform" aria-hidden="true">
                    {Array.from({ length: 44 }, (_, i) => (
                      <i
                        key={i}
                        style={{
                          height:
                            12 +
                            Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.39)) *
                              58 +
                            "px",
                        }}
                      />
                    ))}
                  </div>
                  {localUrl && <audio controls src={localUrl} />}
                </>
              )}
              <span className="selected-badge">
                <Check size={12} /> Ready
              </span>
            </div>
            <h3 title={value.name}>{value.name}</h3>
            <p>
              {bytes(value.size)} <span>·</span> {duration(stream.duration)}{" "}
              <span>·</span> {stream.codec?.toUpperCase()}
            </p>
            {video && (
              <p>
                {stream.width} × {stream.height}
                {metadata.audio ? " · Original audio will be replaced" : ""}
              </p>
            )}
            <div className="file-actions">
              <button disabled={disabled} onClick={() => input.current.click()}>
                <RefreshCw size={13} /> Replace
              </button>
              <button disabled={disabled} onClick={remove}>
                <X size={14} /> Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-upload">
            <div className={"drop-icon " + kind}>
              <Upload size={25} />
            </div>
            <h3>Drop your {kind} here</h3>
            <p>or choose a file from your device</p>
            <button
              className="browse-button"
              disabled={disabled}
              onClick={() => input.current.click()}
            >
              Browse files <ArrowUpRight size={15} />
            </button>
            <small>
              {video
                ? "MP4, MOV, MKV, WEBM & more"
                : "MP3, WAV, AAC, FLAC & more"}
            </small>
          </div>
        )}
      </div>
    </section>
  );
}
