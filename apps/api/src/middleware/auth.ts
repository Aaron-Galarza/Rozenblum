import type { NextFunction, Request, Response } from "express";
import type { Role } from "@rozenblum/shared";
import { verifyToken } from "../lib/token.js";
import { forbidden, unauthorized } from "../lib/http.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredUser } from "../types.js";

type AuthState =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "revoked" }
  | { status: "suspended" }
  | { status: "authenticated"; user: StoredUser };

/**
 * Resolves the bearer token into an explicit authentication state. Callers
 * decide which states are fatal, so the token checks live in one place.
 */
async function resolveAuth(req: Request): Promise<AuthState> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return { status: "missing" };

  const payload = verifyToken(header.slice("Bearer ".length).trim());
  if (!payload) return { status: "invalid" };

  const user = await getRepositories().users.findById(payload.sub);
  if (!user) return { status: "invalid" };
  if ((payload.ver ?? 0) !== (user.sessionVersion ?? 0)) return { status: "revoked" };
  if (user.status !== "Activo") return { status: "suspended" };
  return { status: "authenticated", user };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const auth = await resolveAuth(req);
  if (auth.status === "authenticated") {
    req.authUser = auth.user;
    next();
    return;
  }
  if (auth.status === "missing") {
    next(unauthorized("Falta el token de sesión."));
    return;
  }
  if (auth.status === "revoked") {
    next(unauthorized("Tu sesión fue revocada. Volvé a iniciar sesión."));
    return;
  }
  if (auth.status === "suspended") {
    next(forbidden("Tu cuenta está suspendida. Contactá al administrador."));
    return;
  }
  next(unauthorized());
}

/**
 * Best-effort authentication for endpoints that serve both anonymous and
 * signed-in callers (e.g. checkout). A missing or invalid token is not an
 * error: the request continues as anonymous.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const auth = await resolveAuth(req);
  if (auth.status === "authenticated") req.authUser = auth.user;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authUser) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}
