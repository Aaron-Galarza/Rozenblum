import type { Role } from "@rozenblum/shared";

/** Only return same-origin paths belonging to the authenticated role. */
export function loginDestination(role: Role, next: string | null, origin: string): string {
  const fallback = `/${role}`;
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  try {
    const url = new URL(next, origin);
    if (url.origin === origin && (url.pathname === fallback || url.pathname.startsWith(`${fallback}/`))) {
      return url.pathname + url.search + url.hash;
    }
  } catch {
    // Malformed destinations fall back to the role's home page.
  }
  return fallback;
}
