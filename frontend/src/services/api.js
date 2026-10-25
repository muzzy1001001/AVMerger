export async function request(url, options = {}) {
  const response = await fetch("/api" + url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(data.error);
  }
  return response.status === 204 ? null : response.json();
}
export function upload(file, kind, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload?kind=" + kind);
    const abort = () => xhr.abort();
    signal?.addEventListener("abort", abort, { once: true });
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    const finish = () => signal?.removeEventListener("abort", abort);
    xhr.onload = () => {
      finish();
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        return reject(new Error("The server returned an invalid response."));
      }
      xhr.status < 300
        ? resolve(data)
        : reject(new Error(data.error || "Upload failed"));
    };
    xhr.onerror = () => {
      finish();
      reject(
        new Error(
          "Cannot reach the server. Check that the backend is running.",
        ),
      );
    };
    xhr.onabort = () => {
      finish();
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
export const bytes = (n) =>
  !n
    ? "0 B"
    : n >= 1073741824
      ? (n / 1073741824).toFixed(2) + " GB"
      : n >= 1048576
        ? (n / 1048576).toFixed(1) + " MB"
        : (n / 1024).toFixed(1) + " KB";
export const duration = (n) => {
  if (!Number.isFinite(n)) return "—";
  const sec = Math.round(n);
  return (
    (sec >= 3600 ? Math.floor(sec / 3600) + ":" : "") +
    String(Math.floor(sec / 60) % 60).padStart(2, "0") +
    ":" +
    String(sec % 60).padStart(2, "0")
  );
};
export const cleanName = (value) => {
  let name = value
    .replace(/\.mp4$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 120);
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    name = "_" + name;
  return name || "merged-video";
};
