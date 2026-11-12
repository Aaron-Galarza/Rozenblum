import type { StoredCourse } from "../types.js";

/** Calendar dates in the business timezone are comparable as YYYY-MM-DD strings. */
export function todayInBuenosAires(now = Date.now()): string {
  return new Date(now - 3 * 60 * 60_000).toISOString().slice(0, 10);
}

export function isCourseExpired(course: Pick<StoredCourse, "expiresOn">, now = Date.now()): boolean {
  return Boolean(course.expiresOn && course.expiresOn < todayInBuenosAires(now));
}

/** Start of the day after the selected final day, in Buenos Aires. */
export function courseExpiryInstant(expiresOn: string): string {
  return new Date(Date.parse(`${expiresOn}T03:00:00.000Z`) + 86_400_000).toISOString();
}
