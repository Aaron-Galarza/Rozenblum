type LogLevel = "debug" | "info" | "warn" | "error";

const SILENT =
  process.env.NODE_ENV === "test" || process.env.npm_lifecycle_event === "test";

function write(level: LogLevel, message: string, fields?: Record<string, unknown>) {
  if (SILENT && level !== "error") return;
  const entry = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

/** Minimal structured JSON logger (no external dependencies). */
export const logger = {
  debug(message: string, fields?: Record<string, unknown>) {
    if (process.env.NODE_ENV === "production") return;
    write("debug", message, fields);
  },
  info(message: string, fields?: Record<string, unknown>) {
    write("info", message, fields);
  },
  warn(message: string, fields?: Record<string, unknown>) {
    write("warn", message, fields);
  },
  error(message: string, fields?: Record<string, unknown>) {
    write("error", message, fields);
  },
};
