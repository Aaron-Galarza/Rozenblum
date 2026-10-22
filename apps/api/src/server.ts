import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { markShuttingDown } from "./lib/lifecycle.js";

async function main() {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info("api_started", {
      port: env.PORT,
      mode: "atlas",
      corsOrigins: env.corsOrigins,
    });
  });

  let closing = false;

  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    markShuttingDown();
    logger.info("shutdown_started", { signal });

    // Never hang forever on lingering keep-alive connections.
    const forceTimer = setTimeout(() => {
      logger.error("shutdown_forced", { signal });
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    server.close((error) => {
      void (async () => {
        if (error) logger.error("shutdown_close_error", { message: error.message });
        try {
          await disconnectDatabase();
        } catch (dbError) {
          logger.error("shutdown_db_error", {
            message: dbError instanceof Error ? dbError.message : String(dbError),
          });
        }
        logger.info("shutdown_complete", { signal });
        process.exit(error ? 1 : 0);
      })();
    });

    // Stop accepting new keep-alive connections while in-flight requests drain.
    server.closeIdleConnections?.();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled_rejection", {
      message: reason instanceof Error ? reason.message : String(reason),
    });
  });

  process.on("uncaughtException", (error) => {
    logger.error("uncaught_exception", { message: error.message, stack: error.stack });
    void shutdown("uncaughtException");
  });
}

main().catch((error) => {
  logger.error("api_start_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
