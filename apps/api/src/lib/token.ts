import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "@rozenblum/shared";
import { env } from "../config/env.js";

export type TokenPayload = {
  sub: string;
  role: Role;
  email: string;
  exp: number;
};

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
    const payload = JSON.parse(decode(data)) as TokenPayload;
    if (!payload.sub || !payload.role || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
