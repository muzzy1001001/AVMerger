import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { config, root } from "./services/config.js";
import { router } from "./routes/api.js";
import { errors } from "./middleware/errors.js";
import { cleanup, jobs, cancel } from "./services/jobs.js";
const app = express();
app.disable("x-powered-by");
// Local app: reject browser cross-origin requests, including multipart CSRF.
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host"))
        return res
          .status(403)
          .json({ error: "Cross-origin requests are not allowed." });
    } catch {
      return res.sendStatus(403);
    }
  }
  next();
});
app.use(express.json({ limit: "16kb" }));
app.use("/api", router);
app.use("/api", (req, res) =>
  res.status(404).json({ error: "API endpoint not found." }),
);
const dist = path.join(root, "frontend/dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
}
app.use(errors);
const server = app.listen(config.port, config.host, () =>
  console.log("AV Merger API: http://" + config.host + ":" + config.port),
);
server.requestTimeout = 0;
server.headersTimeout = 60000;
const timer = setInterval(() => cleanup().catch(console.error), 60000);
timer.unref();
cleanup().catch(console.error);
async function shutdown() {
  clearInterval(timer);
  await Promise.all([...jobs.values()].map(cancel));
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
