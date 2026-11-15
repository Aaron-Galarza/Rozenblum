import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { checkDatabaseHealth } from "./config/database.js";
import { ApiError, errorHandler, noStore, notFoundHandler, sendData } from "./lib/http.js";
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
  // Behind a managed proxy the client IP arrives in X-Forwarded-For. The
  // number of trusted hops is configurable (TRUST_PROXY) to avoid spoofing.
  app.set("trust proxy", env.trustProxy);
  // Request context goes first so CORS/body-parser failures still carry a
  // request id and are logged with the same shape as application errors.
  app.use(requestContext);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Server-to-server / curl requests have no Origin header.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new ApiError(403, "FORBIDDEN", "Origen no permitido."));
      },
      credentials: false,
      // Custom response headers the web app reads (course revision / ETag).
      exposedHeaders: ["ETag", "X-Course-Revision", "X-Request-Id"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  // Abuse protection for the endpoints that write data or check credentials.
  const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 20 });
  const checkoutLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 15 });
  const paymentReturnLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 60 });
  const contactLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 10 });
  const youtubePreviewLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 30 });

  /** Liveness: the process is up. */
  app.get("/health", (_req, res) => {
    sendData(res, { status: isShuttingDown() ? "shutting_down" : "ok" });
  });

  /** Readiness: dependencies required to serve traffic are healthy. */
  app.get("/health/ready", createRateLimiter({ windowMs: 60_000, max: 60 }), async (_req, res) => {
    const ready = !isShuttingDown() && (await checkDatabaseHealth());
    res.status(ready ? 200 : 503).json({
      data: { ready },
    });
  });

  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/password", authLimiter);
  app.use("/api/checkout", checkoutLimiter);
  app.use(/^\/api\/orders\/[^/]+\/reconcile$/, paymentReturnLimiter);
  app.use("/api/contact", contactLimiter);
  app.use("/api/teacher/youtube-preview", youtubePreviewLimiter);

  app.use("/api/auth", noStore, authRouter);
  app.use("/api/student", noStore, studentRouter);
  app.use("/api/teacher", noStore, teacherRouter);
  app.use("/api/admin", noStore, adminRouter);
  app.use("/api/media", noStore, mediaRouter);
  app.use("/api", publicRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
