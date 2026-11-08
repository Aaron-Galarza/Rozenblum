import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().trim().optional(),
  MONGODB_DB: z.string().trim().default("rozenblum"),
  AUTH_SECRET: z.string().min(32).optional(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  /**
   * Express `trust proxy` value. Defaults to 1 in production (one managed
   * proxy) and false in development. Accepts true/false, a hop count or an
   * Express subnet/loopback expression.
   */
  TRUST_PROXY: z.string().trim().optional(),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional(),
  MERCADOPAGO_NOTIFICATION_URL: z.union([z.string().url(), z.literal("")]).optional(),
  WEB_PUBLIC_URL: z.union([z.string().url(), z.literal("")]).optional(),
  CLOUDINARY_CLOUD_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
  CLOUDINARY_API_KEY: z.string().regex(/^\d+$/).optional(),
  CLOUDINARY_API_SECRET: z.string().min(16).optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Configuración de entorno inválida: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
}

const raw = parsed.data;
const paymentFields = [raw.MERCADOPAGO_ACCESS_TOKEN, raw.MERCADOPAGO_WEBHOOK_SECRET,
  raw.MERCADOPAGO_NOTIFICATION_URL, raw.WEB_PUBLIC_URL];
if (paymentFields.some(Boolean) && !paymentFields.every(Boolean)) {
  throw new Error("Mercado Pago requiere access token, firma webhook y URL públicas de notificación y web.");
}
if (raw.NODE_ENV === "production" && !paymentFields.every(Boolean)) {
  throw new Error("Configurá Mercado Pago antes de iniciar la API en producción.");
}
if (paymentFields.every(Boolean) && raw.NODE_ENV === "production" &&
  (!raw.MERCADOPAGO_NOTIFICATION_URL!.startsWith("https://") ||
    !raw.WEB_PUBLIC_URL!.startsWith("https://"))) {
  throw new Error("Mercado Pago requiere URL públicas HTTPS en producción.");
}
const cloudinaryFields = [raw.CLOUDINARY_CLOUD_NAME, raw.CLOUDINARY_API_KEY, raw.CLOUDINARY_API_SECRET];
if (cloudinaryFields.some(Boolean) && !cloudinaryFields.every(Boolean)) {
  throw new Error("Cloudinary requiere CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET juntos.");
}
if (raw.NODE_ENV === "production" && !cloudinaryFields.every(Boolean)) {
  throw new Error("Configurá Cloudinary antes de iniciar la API en producción.");
}

if (raw.NODE_ENV !== "test" && (!raw.MONGODB_URI || !raw.AUTH_SECRET)) {
  throw new Error("La API requiere MONGODB_URI y AUTH_SECRET en apps/api/.env.");
}
if (raw.NODE_ENV !== "test" &&
  (raw.AUTH_SECRET?.startsWith("replace-") || raw.MONGODB_URI?.includes("USER:PASSWORD@CLUSTER"))) {
  throw new Error("Reemplazá los valores de ejemplo de MONGODB_URI y AUTH_SECRET antes de iniciar la API.");
}

const corsOrigins = raw.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
const isHttpOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin === origin && !url.username && !url.password;
  } catch {
    return false;
  }
};
if (corsOrigins.length === 0 || !corsOrigins.every(isHttpOrigin)) {
  throw new Error("CORS_ORIGIN debe contener orígenes http(s) separados por coma, sin rutas ni credenciales.");
}
if (raw.NODE_ENV === "production" &&
  corsOrigins.some((origin) => !origin.startsWith("https://") || /^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|$)/i.test(origin))) {
  throw new Error("CORS_ORIGIN debe usar HTTPS y no puede apuntar a localhost en producción.");
}

const isProduction = raw.NODE_ENV === "production";
const isTest = raw.NODE_ENV === "test";

const trustProxy = (() => {
  const value = raw.TRUST_PROXY?.toLowerCase();
  if (!value) return isProduction ? 1 : false;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
})();

export const env = {
  ...raw,
  AUTH_SECRET: raw.AUTH_SECRET ?? "test-only-session-secret-000000000000000000000000",
  isProduction,
  isTest,
  corsOrigins,
  trustProxy,
  paymentsConfigured: paymentFields.every(Boolean),
};
