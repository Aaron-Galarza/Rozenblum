import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";
import { badRequest } from "../lib/http.js";

/**
 * Express 5 types `ParamsDictionary` values as `string | string[]` to support
 * wildcard routes. This API only uses named params (`:id`, `:slug`), which are
 * always strings at runtime, so handlers read them through this narrower type.
 */
export type ApiRequest = Request<Record<string, string>>;

/** Parse (and strip unknown keys) a request body with a shared zod schema. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw badRequest("Los datos enviados no son válidos.", result.error.issues);
  }
  return result.data;
}

export function numericParam(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw badRequest(`${label} inválido.`);
  }
  return parsed;
}

/**
 * Reads the resource version the client loaded before editing. `If-Match` is
 * the standard form and is also what the web client sends; the custom header
 * exists for clients that cannot use `If-Match`.
 */
export function requestRevision(req: ApiRequest): number | undefined {
  const raw = req.get("if-match") ?? req.get("x-expected-revision");
  if (raw === undefined) return undefined;
  const value = raw.replace(/^W\//i, "").replace(/^"|"$/g, "").trim();
  if (!/^\d+$/.test(value)) {
    throw badRequest("La versión del recurso no es válida.");
  }
  return Number(value);
}

/** Reads the optional idempotency key of a creation request. */
export function requestIdempotencyKey(req: ApiRequest): string | undefined {
  const raw = req.get("idempotency-key") ?? req.get("x-idempotency-key");
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (value.length < 8 || value.length > 200) {
    throw badRequest("La clave de idempotencia debe tener entre 8 y 200 caracteres.");
  }
  return value;
}

/** Express 5 forwards rejected promises, but this keeps intent explicit. */
export function asyncRoute(
  handler: (req: ApiRequest, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req as ApiRequest, res, next).catch(next);
  };
}

