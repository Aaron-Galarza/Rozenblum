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

/** Express 5 forwards rejected promises, but this keeps intent explicit. */
export function asyncRoute(
  handler: (req: ApiRequest, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req as ApiRequest, res, next).catch(next);
  };
}

