import type {
  CheckoutInput,
  CheckoutResultDTO,
  OrderDTO,
} from "@rozenblum/shared";
import { badRequest, notFound } from "../lib/http.js";
import { newId, nowIso } from "../lib/utils.js";
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

  const reference = `RB-${new Date().getFullYear()}-${newId("ref").slice(4).toUpperCase()}`;
  const order: StoredOrder = {
    id: newId("ord"),
    externalReference: reference,
    alumno: input.nombre,
    email: input.email.toLowerCase(),
    curso: course.title,
    courseSlug: course.slug,
    courseId: course.legacyId,
    monto: course.price,
    montoCents: course.priceCents,
    fecha: todayLabel(),
    metodo: "MercadoPago",
    estado: "Pendiente",
    createdAt: nowIso(),
  };

  const createdOrder = await repos.orders.create(order);

  const enrollment = await repos.enrollments.create({
    studentEmail: input.email,
    studentName: input.nombre,
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
      studentName: input.nombre,
      teacherEmail: teacher?.email ?? course.professorEmail ?? "",
      teacherName: teacher?.name ?? course.professor,
      messages: [],
    });
  }

  return {
    order: orderToDTO(createdOrder),
    enrollment: enrollmentToDTO(enrollment, course),
    message:
      "Inscripción registrada. Un administrador validará el pago y habilitará el acceso al aula.",
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
