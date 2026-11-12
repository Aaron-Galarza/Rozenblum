import type { CheckoutInput } from "@rozenblum/shared";
import { notFound, unauthorized } from "../lib/http.js";
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
  // A student who changed their initial DNI password can use their session.
  const authenticatedAsAccount = Boolean(actor && account && actor.id === account.id);
  const dniValid = account && !authenticatedAsAccount
    ? await verifyPassword(input.dni, account.passwordHash)
    : false;
  if (account && (account.role !== "alumno" || account.status !== "Activo" ||
      (!authenticatedAsAccount && !dniValid))) {
    throw unauthorized("No pudimos validar la cuenta. Revisá el correo, el DNI o contactá al administrador.");
  }

  const existingEnrollment = await repos.enrollments.findByStudentAndCourse(input.email, course.legacyId);
  return { course, teacher, account, existingEnrollment };
}
