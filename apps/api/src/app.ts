import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { checkDatabaseHealth } from "./config/database.js";
import { getRepositories } from "./repositories/index.js";
import { ApiError, errorHandler, notFoundHandler, sendData } from "./lib/http.js";
import { isShuttingDown } from "./lib/lifecycle.js";
import { createRateLimiter } from "./lib/rate-limit.js";
import { requestContext } from "./middleware/request-context.js";
import { authRouter } from "./routes/auth.js";
import { publicRouter } from "./routes/public.js";
import { studentRouter } from "./routes/student.js";
import { teacherRouter } from "./routes/teacher.js";
import { adminRouter } from "./routes/admin.js";
import { mediaRouter } from "./routes/media.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Behind a managed proxy the client IP arrives in X-Forwarded-For.
  if (env.isProduction) app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Server-to-server / curl requests have no Origin header.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new ApiError(403, "CORS_FORBIDDEN", "Origen no permitido por CORS."));
      },
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);

  // Abuse protection for the endpoints that write data or check credentials.
  const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 20 });
  const checkoutLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 15 });
  const contactLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 10 });

  /** Liveness: the process is up. */
  app.get("/health", (_req, res) => {
    sendData(res, {
      status: isShuttingDown() ? "shutting_down" : "ok",
      uptimeSeconds: Math.round(process.uptime()),
      mode: getRepositories().mode,
      paymentsConfigured: env.paymentsConfigured,
      timestamp: new Date().toISOString(),
    });
  });

  /** Readiness: dependencies required to serve traffic are healthy. */
  app.get("/health/ready", async (_req, res) => {
    const ready = !isShuttingDown() && (await checkDatabaseHealth());
    res.status(ready ? 200 : 503).json({
      data: {
        ready,
        mode: getRepositories().mode,
        database: getRepositories().mode === "atlas" ? (ready ? "up" : "down") : "not_required",
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      },
    });
  });

  app.use("/api/auth/login", authLimiter);
  app.use("/api/checkout", checkoutLimiter);
  app.use("/api/contact", contactLimiter);

  app.use("/api/auth", authRouter);
  app.use("/api/student", studentRouter);
  app.use("/api/teacher", teacherRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/media", mediaRouter);
  app.use("/api", publicRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
