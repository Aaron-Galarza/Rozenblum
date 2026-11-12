import type { SessionDTO, UserDTO } from "@rozenblum/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SESSION_KEY = "rozenblum.session";
export const SESSION_CHANGED = "rozenblum:session-changed";
let sessionRevision = 0;

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
    if (typeof parsed?.token !== "string" || !parsed.token || !parsed.user ||
        !["alumno", "profesor", "admin"].includes(parsed.user.role)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  sessionRevision += 1;
  window.dispatchEvent(new Event(SESSION_CHANGED));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
  sessionRevision += 1;
  window.dispatchEvent(new Event(SESSION_CHANGED));
}

function redirectToLogin(expired = false) {
  if (window.location.pathname !== "/login") {
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/login?next=${encodeURIComponent(next)}${expired ? "&session=expired" : ""}`);
  }
}

function invalidateSession(token: string, revision: number) {
  if (typeof window === "undefined" || sessionRevision !== revision || getSession()?.token !== token) return;
  clearSession();
  redirectToLogin(true);
}

function handleMissingSession() {
  if (typeof window === "undefined") return;
  clearSession();
  redirectToLogin();
}

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown; auth?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function responseData<T>(
  response: Response,
  fallback = { code: "ERROR", message: "Ocurrió un error inesperado." },
): Promise<T> {
  let payload: unknown;
  try {
    const text = await response.text();
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    // A failed read or invalid JSON is handled below without exposing the body.
  }

  if (!response.ok) {
    const failure = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
    throw new ApiClientError(
      response.status,
      typeof failure?.code === "string" ? failure.code : fallback.code,
      typeof failure?.message === "string" ? failure.message : fallback.message,
      failure?.details,
    );
  }

  if (!isRecord(payload) || !Object.hasOwn(payload, "data")) {
    throw new ApiClientError(response.status, "INVALID_RESPONSE", "El servidor devolvió una respuesta inválida.");
  }
  return payload.data as T;
}

export type ApiResponseMeta = {
  status: number;
  headers: Headers;
};

async function performFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta: ApiResponseMeta }> {
  const { body, auth = false, headers, ...rest } = options;
  const started = performance.now();
  const method = rest.method ?? "GET";
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");
  let requestToken: string | undefined;
  const requestRevision = sessionRevision;

  if (auth) {
    const session = getSession();
    if (!session) {
      handleMissingSession();
      throw new ApiClientError(401, "UNAUTHORIZED", "Tu sesión expiró. Volvé a ingresar.");
    }
    requestHeaders.set("authorization", `Bearer ${session.token}`);
    requestToken = session.token;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    if (process.env.NODE_ENV === "development") console.debug("[api]", method, "network_error");
    throw new ApiClientError(
      0,
      "NETWORK_ERROR",
      "No pudimos conectar con el servidor. Verificá que la API esté corriendo.",
    );
  }

  if (process.env.NODE_ENV === "development") {
    console.debug("[api]", method, response.status,
      `${Math.round(performance.now() - started)}ms`, response.headers.get("x-request-id") ?? "");
  }

  if (response.status === 401 && requestToken) invalidateSession(requestToken, requestRevision);
  const meta = { status: response.status, headers: response.headers };
  if (response.status === 204) {
    return { data: undefined as T, meta };
  }

  return { data: await responseData<T>(response), meta };
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await performFetch<T>(path, options)).data;
}

/** Same as `apiFetch`, but also exposes status and headers (e.g. ETag). */
export async function apiFetchWithMeta<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta: ApiResponseMeta }> {
  return performFetch<T>(path, options);
}

/** Downloads an authenticated export without trying to parse its CSV as JSON. */
export async function downloadAuthenticatedFile(path: string, filename: string): Promise<void> {
  const session = getSession();
  if (!session) {
    handleMissingSession();
    throw new ApiClientError(401, "UNAUTHORIZED", "Tu sesión expiró. Volvé a ingresar.");
  }
  const revision = sessionRevision;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { authorization: `Bearer ${session.token}` },
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError(0, "NETWORK_ERROR", "No pudimos conectar con el servidor.");
  }
  if (response.status === 401) invalidateSession(session.token, revision);
  if (!response.ok) await responseData(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
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
export type ImageCategory = "courses" | "professors" | "lessons";

export async function uploadGalleryImage(category: ImageCategory, file: File): Promise<GalleryImage> {
  const started = performance.now();
  const session = getSession();
  const requestRevision = sessionRevision;
  if (!session) {
    handleMissingSession();
    throw new ApiClientError(401, "UNAUTHORIZED", "Tu sesión expiró. Volvé a ingresar.");
  }
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
  if (response.status === 401) invalidateSession(session.token, requestRevision);
  const data = await responseData<GalleryImage>(response, {
    code: "UPLOAD_ERROR",
    message: "No se pudo subir la imagen.",
  });
  if (!data) {
    throw new ApiClientError(response.status, "UPLOAD_ERROR", "No se pudo subir la imagen.");
  }
  return data;
}
