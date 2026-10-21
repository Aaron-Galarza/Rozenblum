import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { getRepositories } from "./repositories/index.js";
import { errorHandler, notFoundHandler, sendData } from "./lib/http.js";
import { authRouter } from "./routes/auth.js";
import { publicRouter } from "./routes/public.js";
import { studentRouter } from "./routes/student.js";
import { teacherRouter } from "./routes/teacher.js";
import { adminRouter } from "./routes/admin.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Server-to-server / curl requests have no Origin header.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origen no permitido por CORS: ${origin}`));
      },
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    sendData(res, {
      status: "ok",
      mode: getRepositories().mode,
      paymentsConfigured: env.paymentsConfigured,
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/student", studentRouter);
  app.use("/api/teacher", teacherRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", publicRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
