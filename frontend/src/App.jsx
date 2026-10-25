import { useEffect, useState } from "react";
import {
  Layers2,
  ArrowRight,
  ArrowDownToLine,
  ShieldCheck,
  Zap,
  AlertCircle,
  Sun,
  Moon,
} from "lucide-react";
import Workspace from "./components/Workspace";
import { request } from "./services/api";
export default function App() {
  const [light, setLight] = useState(false),
    [health, setHealth] = useState(null);
  useEffect(() => {
    request("/health")
      .then(setHealth)
      .catch(() => setHealth({ ready: false }));
  }, []);
  return (
    <div className={light ? "app light" : "app"}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="AV Merger home">
          <span className="brand-mark">
            <Layers2 size={23} />
          </span>
          <span>
            AV<span className="brand-muted"> Merger</span>
          </span>
          <span className="local-pill">LOCAL STUDIO</span>
        </a>
        <div className="header-right">
          <span className="private-label">
            <span className="status-dot" /> Your files stay on your device
          </span>
          <button
            className="icon-button"
            onClick={() => setLight(!light)}
            aria-label={light ? "Use dark theme" : "Use light theme"}
          >
            {light ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>
      <main>
        <section className="intro">
          <div className="eyebrow">
            <span /> LESS FRICTION. MORE CREATION.
          </div>
          <h1>
            Two files.
            <br className="mobile-break" /> One perfect <em>match.</em>
          </h1>
          <p>
            Merge video and audio into one file.
            <br className="mobile-break" /> Preview, download, and make it
            yours.
          </p>
          <div className="benefits">
            <span>
              <Zap size={14} /> Original quality
            </span>
            <span>
              <ShieldCheck size={14} /> 100% local processing
            </span>
            <span>
              <ArrowDownToLine size={14} /> Ready-to-share MP4
            </span>
          </div>
        </section>
        {health && !health.ready && (
          <div className="banner warning">
            <AlertCircle size={18} />
            <div>
              <strong>Media tools aren’t available.</strong> Make sure FFmpeg
              and FFprobe are installed, then restart the server. See README for
              Windows setup.
            </div>
          </div>
        )}
        <div className="workspace-overview">
          <div>
            <h2>Your workspaces</h2>
            <p>
              Four independent merges. Your files and settings stay separate.
            </p>
          </div>
          <nav aria-label="Jump to workspace">
            {[1, 2, 3, 4].map((number) => (
              <a href={`#workspace-${number}`} key={number}>
                0{number}
              </a>
            ))}
          </nav>
        </div>
        <div className="workspace-list">
          {[1, 2, 3, 4].map((number) => (
            <Workspace key={number} number={number} health={health} />
          ))}
        </div>
        <div className="how-it-works">
          <span>
            01 <b>Add your files</b>
          </span>
          <ArrowRight size={14} />
          <span>
            02 <b>Make it yours</b>
          </span>
          <ArrowRight size={14} />
          <span>
            03 <b>Merge &amp; download</b>
          </span>
        </div>
      </main>
      <footer>
        <span>
          <Layers2 size={15} /> AV Merger <i>Made for your next creation.</i>
        </span>
        <span>
          <ShieldCheck size={13} /> Private by design <b>·</b> Powered by FFmpeg
        </span>
      </footer>
    </div>
  );
}
