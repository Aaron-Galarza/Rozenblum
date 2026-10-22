import type {
  CheckoutInput,
  CheckoutResultDTO,
  OrderDTO,
} from "@rozenblum/shared";
import { badRequest, notFound, unauthorized } from "../lib/http.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { initialsFromName, newId, nowIso } from "../lib/utils.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredOrder } from "../types.js";
import { enrollmentToDTO, orderToDTO } from "./mappers.js";

function todayLabel() {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

export async function checkout(input: CheckoutInput): Promise<CheckoutResultDTO> {
  const repos = getRepositories();
  const course = await repos.courses.findBySlug(input.courseSlug);
  if (!course || course.status !== "published") {
    throw notFound("El curso solicitado no está disponible.");
  }

  const account = await repos.users.findByEmail(input.email);
  if (account && (account.role !== "alumno" || account.status !== "Activo" || !verifyPassword(input.password, account.passwordHash))) {
    throw unauthorized("No pudimos validar la cuenta. Revisá el correo, la contraseña o contactá al administrador.");
  }

  const existingEnrollment = await repos.enrollments.findByStudentAndCourse(
    input.email,
    course.legacyId,
  );
  if (existingEnrollment) {
    throw badRequest(
      existingEnrollment.status === "Pendiente"
        ? "Ya existe una inscripción pendiente para este correo. Avisanos por WhatsApp para agilizar la validación."
        : "Este correo ya tiene una inscripción para el curso.",
    );
  }

  if (!account) {
    await repos.users.create({
      name: input.nombre,
      email: input.email,
      role: "alumno",
      passwordHash: hashPassword(input.password),
      initials: initialsFromName(input.nombre),
    });
  }

  const reference = `RB-${new Date().getFullYear()}-${newId("ref").slice(4).toUpperCase()}`;
  const order: StoredOrder = {
    id: newId("ord"),
    externalReference: reference,
    alumno: account?.name ?? input.nombre,
    email: input.email.toLowerCase(),
    curso: course.title,
    courseSlug: course.slug,
    courseId: course.legacyId,
    monto: course.price,
    montoCents: course.priceCents,
    fecha: todayLabel(),
    metodo: "Pendiente de pago",
    estado: "Pendiente",
    createdAt: nowIso(),
  };

  const createdOrder = await repos.orders.create(order);

  const enrollment = await repos.enrollments.create({
    studentEmail: input.email,
    studentName: account?.name ?? input.nombre,
    courseId: course.legacyId,
    status: "Pendiente",
    completedLessonIds: [],
  });

  const conversation = await repos.conversations.findByStudentAndCourse(
    input.email,
    course.legacyId,
  );
  if (!conversation) {
    const teacher = course.professorEmail
      ? await repos.users.findByEmail(course.professorEmail)
      : null;
    await repos.conversations.create({
      id: newId("cnv"),
      courseId: course.legacyId,
      studentEmail: input.email.toLowerCase(),
      studentName: account?.name ?? input.nombre,
      teacherEmail: teacher?.email ?? course.professorEmail ?? "",
      teacherName: teacher?.name ?? course.professor,
      messages: [],
    });
  }

  return {
    order: orderToDTO(createdOrder),
    enrollment: enrollmentToDTO(enrollment, course),
    message:
      "Solicitud registrada. Contactanos para coordinar el pago; un administrador confirmará el acceso al aula.",
  };
}

export async function getOrderReceipt(reference: string, email: string): Promise<OrderDTO> {
  if (!email.trim()) throw notFound("No encontramos la orden solicitada.");
  const order = await getRepositories().orders.findByReference(reference);
  if (!order) throw notFound("No encontramos la orden solicitada.");
  if (order.email.toLowerCase() !== email.trim().toLowerCase()) {
    throw notFound("No encontramos la orden solicitada.");
  }
  return orderToDTO(order);
}
