import type { CheckoutInput } from "@rozenblum/shared";
import { badRequest, notFound, unauthorized } from "../lib/http.js";
import { verifyPassword } from "../lib/password.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredCourse, StoredUser } from "../types.js";

export type CheckoutParticipants = {
  course: StoredCourse;
  teacher: StoredUser;
  account: StoredUser | null;
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
  if (existingEnrollment) {
    throw badRequest(existingEnrollment.status === "Pendiente"
      ? "Ya existe una inscripción pendiente para este correo. Revisá el estado de tu orden o completá el pago en Mercado Pago."
      : "Este correo ya tiene una inscripción para el curso.");
  }
  return { course, teacher, account };
}
