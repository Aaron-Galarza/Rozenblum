import type { StoredCourse } from "../types.js";

const DAY_MS = 86_400_000;
const ENROLLMENT_CUTOFF_DAYS = 7;

/** Calendar dates in the business timezone are comparable as YYYY-MM-DD strings. */
export function todayInBuenosAires(now = Date.now()): string {
  return new Date(now - 3 * 60 * 60_000).toISOString().slice(0, 10);
}

export function isCourseExpired(course: Pick<StoredCourse, "expiresOn">, now = Date.now()): boolean {
  return Boolean(course.expiresOn && course.expiresOn < todayInBuenosAires(now));
}

/** Start of the day after the selected final day, in Buenos Aires. */
export function courseExpiryInstant(expiresOn: string): string {
  return new Date(Date.parse(`${expiresOn}T03:00:00.000Z`) + DAY_MS).toISOString();
}

/** Registration closes at midnight seven calendar days before the final day. */
export function courseEnrollmentClosesAt(expiresOn: string): string {
  return new Date(Date.parse(`${expiresOn}T03:00:00.000Z`) - ENROLLMENT_CUTOFF_DAYS * DAY_MS).toISOString();
}

export function isCourseEnrollmentOpen(course: Pick<StoredCourse, "expiresOn">, now = Date.now()): boolean {
  return !course.expiresOn || Date.parse(courseEnrollmentClosesAt(course.expiresOn)) > now;
}

/** Used by Mongo's date-string filter in the checkout write transaction. */
export function earliestOpenCourseExpiry(now = Date.now()): string {
  return todayInBuenosAires(now + ENROLLMENT_CUTOFF_DAYS * DAY_MS);
}
