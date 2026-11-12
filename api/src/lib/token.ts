import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ROLES } from "@rozenblum/shared";
import type { Role } from "@rozenblum/shared";
import { env } from "../config/env.js";

export type TokenPayload = {
  sub: string;
  role: Role;
  email: string;
  /** Session version of the user at issue time; used for revocation. */
  ver: number;
  exp: number;
};

const tokenPayloadSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(ROLES),
  email: z.string().min(1),
  // Tokens issued before session versioning have no `ver` and map to 0.
  ver: z.number().int().nonnegative().default(0),
  exp: z.number().int().positive(),
});

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

function sign(data: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(data).digest("base64url");
}

export function createToken(payload: Omit<TokenPayload, "exp">, ttlSeconds = 60 * 60 * 8): string {
  const body: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const data = encode(JSON.stringify(body));
  return `${data}.${sign(data)}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = Buffer.from(sign(data), "utf8");
  const received = Buffer.from(signature, "utf8");
  if (expected.length !== received.length) return null;
  if (!timingSafeEqual(expected, received)) return null;

  try {
    const parsed = tokenPayloadSchema.safeParse(JSON.parse(decode(data)));
    if (!parsed.success) return null;
    const payload: TokenPayload = parsed.data;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
