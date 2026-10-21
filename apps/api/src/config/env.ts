import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.enum(["mock", "atlas"]).default("mock"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().trim().optional(),
  MONGODB_DB: z.string().trim().default("rozenblum"),
  AUTH_SECRET: z.string().min(16).optional(),
  ALLOW_DEMO_LOGIN: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  DEMO_PASSWORD: z.string().min(6).default("rozenblum-demo-2026"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  SUPPORT_EMAIL: z.string().email().default("soporte@estudio.com"),
  CONTACT_WHATSAPP: z.string().default("5493621466878"),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADOPAGO_PUBLIC_KEY: z.string().optional(),
  SEED_SKIP_IF_POPULATED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Configuración de entorno inválida:\n${issues}`);
}

const raw = parsed.data;

if (raw.APP_MODE === "atlas" && !raw.MONGODB_URI) {
  throw new Error(
    "APP_MODE=atlas requiere MONGODB_URI. Definí la cadena de conexión en apps/api/.env. " +
      "La API no cae a modo mock de forma automática.",
  );
}

if (raw.APP_MODE === "atlas" && !raw.AUTH_SECRET) {
  throw new Error(
    "APP_MODE=atlas requiere AUTH_SECRET (32+ caracteres aleatorios) para firmar sesiones.",
  );
}

if (!raw.AUTH_SECRET && raw.NODE_ENV !== "test") {
  console.warn(
    "[config] AUTH_SECRET no definido: se usa un secreto efímero sólo para desarrollo mock. " +
      "No usar este modo en producción.",
  );
}

/**
 * Demo accounts share a well-known password. In production they must not be
 * reachable without a password, otherwise anyone could sign in as admin.
 */
if (raw.NODE_ENV === "production" && raw.ALLOW_DEMO_LOGIN) {
  throw new Error(
    "ALLOW_DEMO_LOGIN debe ser false en producción: el login demo permite iniciar sesión sin contraseña.",
  );
}

if (raw.NODE_ENV === "production" && raw.DEMO_PASSWORD === "rozenblum-demo-2026") {
  throw new Error(
    "DEMO_PASSWORD no puede conservar el valor por defecto en producción. Definí una contraseña aleatoria.",
  );
}

export const env = {
  ...raw,
  AUTH_SECRET:
    raw.AUTH_SECRET ??
    "dev-only-ephemeral-secret-do-not-use-in-production-000000",
  isProduction: raw.NODE_ENV === "production",
  corsOrigins: raw.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  paymentsConfigured: Boolean(raw.MERCADOPAGO_ACCESS_TOKEN),
};
