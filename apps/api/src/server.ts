import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

async function main() {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[api] Escuchando en http://localhost:${env.PORT} (modo ${env.APP_MODE}).`);
    console.log(`[api] CORS permitido para: ${env.corsOrigins.join(", ")}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} recibido: cerrando servidor.`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Do not hang forever on keep-alive connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[api] No se pudo iniciar:", error instanceof Error ? error.message : error);
  process.exit(1);
});
