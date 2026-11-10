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
export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, "CONFLICT", message, details);

export function sendData<T>(res: Response, data: T, status = 200) {
  res.status(status).json({ data });
}

/** Error envelope shared by every failure path, always carrying the request id. */
function errorPayload(
  res: Response,
  code: string,
  message: string,
  details?: unknown,
) {
  const requestId =
    typeof res.locals?.requestId === "string" ? res.locals.requestId : undefined;
  return { error: { code, message, details, requestId } };
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const bodyError = error as { type?: string; status?: number; statusCode?: number };

  if (bodyError?.type === "entity.too.large") {
    res.status(413).json(
      errorPayload(res, "PAYLOAD_TOO_LARGE", "La solicitud supera el tamaño máximo permitido."),
    );
    return;
  }
  if (bodyError?.type === "entity.parse.failed") {
    res.status(400).json(
      errorPayload(res, "BAD_REQUEST", "El cuerpo de la solicitud no es JSON válido."),
    );
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.status).json(
      errorPayload(res, error.code, error.message, error.details),
    );
    return;
  }

  if (error instanceof Error && error.name === "ZodError") {
    res.status(400).json(
      errorPayload(
        res,
        "VALIDATION_ERROR",
        "Los datos enviados no son válidos.",
        (error as Error & { issues?: unknown }).issues,
      ),
    );
    return;
  }

  const status = bodyError?.status ?? bodyError?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json(
      errorPayload(res, "BAD_REQUEST", "No se pudo procesar la solicitud."),
    );
    return;
  }

  logger.error("unhandled_error", {
    requestId:
      typeof res.locals?.requestId === "string" ? res.locals.requestId : undefined,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  });
  res.status(500).json(
    errorPayload(
      res,
      "INTERNAL_ERROR",
      "Ocurrió un error inesperado. Intentá nuevamente.",
    ),
  );
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json(
    errorPayload(res, "NOT_FOUND", "Ruta no encontrada."),
  );
}
