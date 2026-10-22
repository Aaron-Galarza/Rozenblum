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
    throw new ApiClientError(
      0,
      "NETWORK_ERROR",
      "No pudimos conectar con el servidor. Verificá que la API esté corriendo.",
    );
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

export async function uploadLessonImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new ApiClientError(400, "INVALID_IMAGE", "Usá una imagen PNG, JPEG, GIF o WebP de hasta 5 MB.");
  }
  const session = getSession();
  if (!session) throw new ApiClientError(401, "UNAUTHORIZED", "Tu sesión expiró. Volvé a ingresar.");
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/media/images`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.token}`, "content-type": file.type },
      body: file,
    });
  } catch {
    throw new ApiClientError(0, "NETWORK_ERROR", "No pudimos subir la imagen. Verificá la conexión.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiFailure | null;
    throw new ApiClientError(response.status, payload?.error?.code ?? "UPLOAD_ERROR", payload?.error?.message ?? "No pudimos subir la imagen.");
  }
  const payload = await response.json() as { data: { id: string } };
  return `${API_URL}/api/media/images/${payload.data.id}`;
}
