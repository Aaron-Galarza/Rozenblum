import type { NextFunction, Request, Response } from "express";
import { logger } from "./logger.js";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Sesión inválida o expirada.") =>
  new ApiError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "No tenés permisos para esta acción.") =>
  new ApiError(403, "FORBIDDEN", message);
export const notFound = (message = "Recurso no encontrado.") =>
  new ApiError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new ApiError(409, "CONFLICT", message);

export function sendData<T>(res: Response, data: T, status = 200) {
  res.status(status).json({ data });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error instanceof Error && error.name === "ZodError") {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Los datos enviados no son válidos.",
        details: (error as Error & { issues?: unknown }).issues,
      },
    });
    return;
  }

  const requestId =
    typeof res.locals?.requestId === "string" ? res.locals.requestId : undefined;
  logger.error("unhandled_error", {
    requestId,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  });
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Ocurrió un error inesperado. Intentá nuevamente.",
      requestId,
    },
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Ruta no encontrada." },
  });
}
