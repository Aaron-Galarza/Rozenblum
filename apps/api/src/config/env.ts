import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().trim().optional(),
  MONGODB_DB: z.string().trim().default("rozenblum"),
  AUTH_SECRET: z.string().min(32).optional(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADOPAGO_PUBLIC_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Configuración de entorno inválida: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
}

const raw = parsed.data;
if (raw.NODE_ENV !== "test" && (!raw.MONGODB_URI || !raw.AUTH_SECRET)) {
  throw new Error("La API requiere MONGODB_URI y AUTH_SECRET en apps/api/.env.");
}
if (raw.NODE_ENV !== "test" &&
  (raw.AUTH_SECRET?.startsWith("replace-") || raw.MONGODB_URI?.includes("USER:PASSWORD@CLUSTER"))) {
  throw new Error("Reemplazá los valores de ejemplo de MONGODB_URI y AUTH_SECRET antes de iniciar la API.");
}

export const env = {
  ...raw,
  AUTH_SECRET: raw.AUTH_SECRET ?? "test-only-session-secret-000000000000000000000000",
  isProduction: raw.NODE_ENV === "production",
  isTest: raw.NODE_ENV === "test",
  corsOrigins: raw.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
  paymentsConfigured: Boolean(raw.MERCADOPAGO_ACCESS_TOKEN),
};
