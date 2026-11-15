import { createHmac } from "node:crypto";
import { env } from "../config/env.js";

/** Opaque, keyed binding for comparing a checkout with an existing student. */
export function dniBinding(email: string, dni: string): string {
  return createHmac("sha256", env.AUTH_SECRET)
    .update("student-dni-binding:v1\0")
    .update(email.toLowerCase())
    .update("\0")
    .update(dni)
    .digest("hex");
}
