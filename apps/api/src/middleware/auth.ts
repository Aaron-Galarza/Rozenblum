import type { NextFunction, Request, Response } from "express";
import type { Role } from "@rozenblum/shared";
import { verifyToken } from "../lib/token.js";
import { forbidden, unauthorized } from "../lib/http.js";
import { getRepositories } from "../repositories/index.js";

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

  if (user.status !== "Activo") {
    next(forbidden("Tu cuenta está suspendida. Contactá al administrador."));
    return;
  }

  req.authUser = user;
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
