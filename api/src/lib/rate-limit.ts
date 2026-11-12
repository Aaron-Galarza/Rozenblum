import type { Request, RequestHandler } from "express";
import { ApiError } from "./http.js";

type Bucket = { count: number; resetAt: number };

type RateLimitOptions = {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed per key inside the window. */
  max: number;
  /** Optional key resolver. Defaults to the client IP. */
  key?: (req: Request) => string;
};

/**
 * Small in-memory fixed-window rate limiter.
 *
 * It is intentionally dependency-free and per-instance: sufficient for a single
 * API process. If the API is later scaled horizontally, swap the store for a
 * shared one (e.g. Redis) behind this same middleware contract.
 */
export function createRateLimiter({ windowMs, max, key }: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  const sweep = (now: number) => {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  };

  return (req, res, next) => {
    const now = Date.now();
    sweep(now);

    const bucketKey = key?.(req) ?? req.ip ?? "unknown";
    const bucket = buckets.get(bucketKey);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", String(max - 1));
      next();
      return;
    }

    if (bucket.count >= max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      next(
        new ApiError(
          429,
          "RATE_LIMITED",
          "Demasiadas solicitudes. Esperá unos minutos e intentá nuevamente.",
        ),
      );
      return;
    }

    bucket.count += 1;
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    next();
  };
}
