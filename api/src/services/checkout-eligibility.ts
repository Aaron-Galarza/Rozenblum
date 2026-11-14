import type { CheckoutInput } from "@rozenblum/shared";
import { ApiError, notFound } from "../lib/http.js";
import { isCourseEnrollmentOpen } from "../lib/course-expiry.js";
import { verifyPassword } from "../lib/password.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredCourse, StoredEnrollment, StoredUser } from "../types.js";

export type CheckoutParticipants = {
  course: StoredCourse;
  teacher: StoredUser;
  account: StoredUser | null;
  existingEnrollment: StoredEnrollment | null;
};

export async function resolveCheckoutParticipants(
  input: CheckoutInput,
  actor?: StoredUser,
): Promise<CheckoutParticipants> {
  const repos = getRepositories();
  const course = await repos.courses.findBySlug(input.courseSlug);
  if (!course || course.status !== "published") {
    throw notFound("El curso solicitado no está disponible.");
  }
  if (!isCourseEnrollmentOpen(course)) {
    throw notFound("Las inscripciones a este curso ya cerraron.");
  }
  const teacher = course.professorEmail
    ? await repos.users.findByEmail(course.professorEmail)
    : null;
  if (!teacher || teacher.role !== "profesor" || teacher.status !== "Activo") {
    throw notFound("El curso solicitado no está disponible.");
  }

  const account = await repos.users.findByEmail(input.email);
  const identityError = () => new ApiError(403, "CHECKOUT_ACCOUNT_MISMATCH",
    "No pudimos validar la cuenta. Revisá el correo, el DNI o contactá al administrador.");
  if (account && (account.role !== "alumno" || account.status !== "Activo")) {
    throw identityError();
  }
  const authenticatedAsAccount = Boolean(actor && account && actor.id === account.id);
  if (account && !authenticatedAsAccount) {
    // Older paid accounts may predate studentDniHash; their first paid order
    // retains the protected DNI hash even after a login password change.
    const hash = account.studentDniHash ?? await repos.orders.findStudentDniHash(input.email)
      ?? account.passwordHash;
    if (!await verifyPassword(input.dni, hash)) throw identityError();
  }

  const existingEnrollment = await repos.enrollments.findByStudentAndCourse(input.email, course.legacyId);
  return { course, teacher, account, existingEnrollment };
}
