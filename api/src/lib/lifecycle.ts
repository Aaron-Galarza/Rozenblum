let shuttingDown = false;

/** Marks the process as draining so readiness checks start failing. */
export function markShuttingDown() {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
