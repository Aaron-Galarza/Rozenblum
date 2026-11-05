import type { NextFunction, Request, Response } from "express";
import type { Role } from "@rozenblum/shared";
import { verifyToken } from "../lib/token.js";
import { forbidden, unauthorized } from "../lib/http.js";
import { getRepositories } from "../repositories/index.js";

/**
 * Resolves the bearer token into the current user. Returns `null` for missing,
 * malformed, revoked tokens or suspended accounts; callers decide whether that
 * is fatal.
 */
async function resolveUser(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;

  const payload = verifyToken(header.slice("Bearer ".length).trim());
  if (!payload) return null;

  const user = await getRepositories().users.findById(payload.sub);
  if (!user) return null;
  if ((payload.ver ?? 0) !== (user.sessionVersion ?? 0)) return null;
  if (user.status !== "Activo") return null;
  return user;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(unauthorized("Falta el token de sesión."));
    return;
  }

  const payload = verifyToken(header.slice("Bearer ".length).trim());
  if (!payload) {
    next(unauthorized());
    return;
  }

  const user = await getRepositories().users.findById(payload.sub);
  if (!user) {
    next(unauthorized());
    return;
  }

  if ((payload.ver ?? 0) !== (user.sessionVersion ?? 0)) {
    next(unauthorized("Tu sesión fue revocada. Volvé a iniciar sesión."));
    return;
  }

  if (user.status !== "Activo") {
    next(forbidden("Tu cuenta está suspendida. Contactá al administrador."));
    return;
  }

  req.authUser = user;
  next();
}

/**
 * Best-effort authentication for endpoints that serve both anonymous and
 * signed-in callers (e.g. checkout). A missing or invalid token is not an
 * error: the request continues as anonymous.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (user) req.authUser = user;
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
