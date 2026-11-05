import type { ApiFailure, SessionDTO, UserDTO } from "@rozenblum/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SESSION_KEY = "rozenblum.session";

export type Session = SessionDTO;
export type SessionUser = UserDTO;

export class ApiClientError extends Error {
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

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.token || !parsed?.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown; auth?: boolean };

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = false, headers, ...rest } = options;
  const started = performance.now();
  const method = rest.method ?? "GET";
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");

  if (auth) {
    const session = getSession();
    if (!session) {
      throw new ApiClientError(401, "UNAUTHORIZED", "Tu sesión expiró. Volvé a ingresar.");
    }
    requestHeaders.set("authorization", `Bearer ${session.token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    if (process.env.NODE_ENV === "development") console.debug("[api]", method, path.split("?")[0], "network_error");
    throw new ApiClientError(
      0,
      "NETWORK_ERROR",
      "No pudimos conectar con el servidor. Verificá que la API esté corriendo.",
    );
  }

  if (process.env.NODE_ENV === "development") {
    console.debug("[api]", method, path.split("?")[0], response.status,
      `${Math.round(performance.now() - started)}ms`, response.headers.get("x-request-id") ?? "");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as { data?: T } & ApiFailure) : undefined;

  if (!response.ok) {
    const failure = payload as ApiFailure | undefined;
    throw new ApiClientError(
      response.status,
      failure?.error?.code ?? "ERROR",
      failure?.error?.message ?? "Ocurrió un error inesperado.",
      failure?.error?.details,
    );
  }

  return (payload as { data: T }).data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}

export type GalleryImage = {
  id: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  createdAt: string;
};

export type GalleryPage = { images: GalleryImage[]; nextCursor: string | null };
export type ImageCategory = "courses" | "professors" | "lessons" | "brand";

export async function uploadGalleryImage(category: ImageCategory, file: File): Promise<GalleryImage> {
  const started = performance.now();
  const session = getSession();
  if (!session) throw new ApiClientError(401, "UNAUTHORIZED", "Tu sesión expiró. Volvé a ingresar.");
  if (file.size === 0 || file.size > 8 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type)) {
    throw new ApiClientError(400, "INVALID_IMAGE", "Elegí una imagen PNG, JPEG, WebP o AVIF de hasta 8 MB.");
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/media/${category}`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.token}`, "content-type": file.type },
      body: file,
    });
  } catch {
    if (process.env.NODE_ENV === "development") console.debug("[api]", "POST", `/api/media/${category}`, "network_error");
    throw new ApiClientError(0, "NETWORK_ERROR", "No pudimos conectar con el servidor.");
  }
  if (process.env.NODE_ENV === "development") {
    console.debug("[api]", "POST", `/api/media/${category}`, response.status,
      `${Math.round(performance.now() - started)}ms`, response.headers.get("x-request-id") ?? "");
  }
  const payload = await response.json() as { data?: GalleryImage; error?: { code: string; message: string } };
  if (!response.ok || !payload.data) {
    throw new ApiClientError(response.status, payload.error?.code ?? "UPLOAD_ERROR", payload.error?.message ?? "No se pudo subir la imagen.");
  }
  return payload.data;
}
