import type { Request } from "express";

/**
 * Absolute ceiling for list queries. High enough for the current catalogue but
 * low enough to prevent memory blow-ups from pathological collections.
 */
export const LIST_HARD_LIMIT = 1000;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
/** History pages are read from the newest message backwards. */
const DEFAULT_MESSAGE_LIMIT = 500;

export type Pagination = { limit: number; offset: number };

/**
 * Reads optional `limit` / `offset` query params with strict bounds.
 * Invalid values fall back to safe defaults instead of failing the request.
 */
export function parsePagination(
  req: Request,
  defaults: { limit?: number } = {},
): Pagination {
  const rawLimit = Number(req.query.limit);
  const rawOffset = Number(req.query.offset);

  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : defaults.limit ?? DEFAULT_LIMIT;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  return { limit, offset };
}

/** Chat history keeps the same page size the web client already displays whole. */
export function parseMessagePagination(req: Request): Pagination {
  return parsePagination(req, { limit: DEFAULT_MESSAGE_LIMIT });
}

