export function errors(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status =
    error.code === "LIMIT_FILE_SIZE"
      ? 413
      : error instanceof SyntaxError
        ? 400
        : error.status || 400;
  const message =
    error.code === "LIMIT_FILE_SIZE"
      ? "File exceeds the configured upload limit."
      : error.code === "ENOSPC"
        ? "Insufficient disk space. Free space and try again."
        : error.message || "Unexpected server error.";
  res.status(status).json({ error: message.slice(0, 1800) });
}
