type FailureShape = { status?: unknown; code?: unknown; message?: unknown; details?: unknown };

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function failureShape(error: unknown): FailureShape {
  return typeof error === "object" && error !== null ? error as FailureShape : {};
}

export function editorErrorMessage(error: unknown, options: { creationMayHaveSucceeded?: boolean; verifyBeforeRetry?: boolean } = {}): string {
  const failure = failureShape(error);
  if (failure.status === 409 || failure.code === "CONFLICT") {
    const details = typeof failure.details === "object" && failure.details !== null ? failure.details as { currentRevision?: unknown; updatedAt?: unknown } : {};
    const revision = typeof details.currentRevision === "number" ? ` La versión actual del curso es ${details.currentRevision}.` : "";
    const updatedAt = typeof details.updatedAt === "string" ? ` Última actualización: ${details.updatedAt}.` : "";
    return `El curso cambió mientras lo editabas. Tus cambios locales siguen aquí y no se sobrescribieron.${revision}${updatedAt} No se combinaron automáticamente: conservá lo necesario, recargá la versión actual y reaplicá manualmente.`;
  }
  const serverFailure = typeof failure.status === "number" && failure.status >= 500;
  if (failure.status === 0 || failure.code === "NETWORK_ERROR" || ((options.creationMayHaveSucceeded || options.verifyBeforeRetry) && serverFailure)) {
    if (options.creationMayHaveSucceeded) return "Se perdió la conexión y no se pudo confirmar la creación. Tus cambios siguen en el editor; verificá la estructura del curso antes de volver a crear para evitar duplicados.";
    if (options.verifyBeforeRetry) return "No se pudo confirmar el resultado. Volvé a abrir el curso desde la barra lateral para comprobar si se aplicó antes de repetir la acción.";
    return "Se perdió la conexión. Tus cambios locales se conservaron; verificá que la API esté disponible y reintentá.";
  }
  if (typeof failure.message === "string" && failure.message) return failure.message;
  return error instanceof Error ? error.message : "No se pudo guardar el cambio. Intentá nuevamente.";
}

export function canRetryEditorOperation(error: unknown): boolean {
  const { status, code } = failureShape(error);
  if (status === 409 || code === "CONFLICT") return false;
  return status === 0 || code === "NETWORK_ERROR" || (typeof status === "number" && status >= 500);
}

export function moveIdInOrder<T extends string | number>(
  ids: readonly T[],
  id: T,
  direction: "up" | "down",
): T[] | null {
  if (new Set(ids).size !== ids.length) return null;
  const index = ids.indexOf(id);
  if (index < 0) return null;
  const nextIndex = index + (direction === "up" ? -1 : 1);
  if (nextIndex < 0 || nextIndex >= ids.length) return null;
  const next = [...ids];
  [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
  return next;
}
