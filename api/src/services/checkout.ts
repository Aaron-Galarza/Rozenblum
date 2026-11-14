import type {
  CheckoutInput,
  CheckoutResultDTO,
  OrderDTO,
} from "@rozenblum/shared";
import { ApiError, badRequest, conflict, notFound } from "../lib/http.js";
import { courseEnrollmentClosesAt } from "../lib/course-expiry.js";
import { logger } from "../lib/logger.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { newId, nowIso } from "../lib/utils.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredCourse, StoredEnrollment, StoredOrder, StoredUser } from "../types.js";
import { resolveCheckoutParticipants } from "./checkout-eligibility.js";
import { persistCheckoutRecords } from "./checkout-records.js";
import { enrollmentToDTO, orderToDTO } from "./mappers.js";
import { paymentGateway } from "./mercadopago.js";

function todayLabel() {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

async function resumeCheckout(input: CheckoutInput, course: StoredCourse,
  account: StoredUser | null, enrollment: StoredEnrollment): Promise<CheckoutResultDTO> {
  if (enrollment.status !== "Pendiente") {
    throw conflict("Ya existe una inscripción para este curso y correo.");
  }
  const order = await getRepositories().orders.findLatestByStudentAndCourse(input.email, course.legacyId);
  const receipt = order && orderToDTO(order);
  if (!order || order.paymentProvider !== "mercadopago" ||
      !["Pendiente", "Rechazado"].includes(order.estado) || !order.preferenceId ||
      !receipt?.paymentUrl || (!account && (!order.dniPasswordHash ||
        !await verifyPassword(input.dni, order.dniPasswordHash)))) {
    throw conflict("Esta inscripción necesita revisión antes de iniciar otro pago. Contactá al Estudio.");
  }
  return {
    order: receipt,
    enrollment: enrollmentToDTO(enrollment, course),
    payment: { provider: "mercadopago", preferenceId: order.preferenceId, url: receipt.paymentUrl },
    message: "Retomá el pago de tu inscripción existente en Mercado Pago.",
  };
}

export async function checkout(
  input: CheckoutInput,
  /** Present when the caller sent a valid session (see `optionalAuth`). */
  actor?: StoredUser,
): Promise<CheckoutResultDTO> {
  const { course, account, existingEnrollment } = await resolveCheckoutParticipants(input, actor);
  // The account is created only after Mercado Pago confirms the payment.
  const gateway = paymentGateway();
  if (!gateway) throw new ApiError(503, "PAYMENTS_NOT_CONFIGURED", "Mercado Pago no está disponible en este momento. Intentá más tarde.");
  if (course.priceCents <= 0) {
    throw badRequest("Este curso no tiene un importe válido para Mercado Pago.");
  }
  if (existingEnrollment) {
    return resumeCheckout(input, course, account, existingEnrollment);
  }
  const reference = `RB-${new Date().getFullYear()}-${newId("ref").slice(4).toUpperCase()}`;
  const paymentExpiresAt = new Date(Math.min(Date.now() + 5 * 60_000,
    course.expiresOn ? Date.parse(courseEnrollmentClosesAt(course.expiresOn)) : Infinity)).toISOString();
  const preference = await gateway.createPreference({
    reference, courseId: course.legacyId, title: course.title,
    priceCents: course.priceCents, email: input.email.toLowerCase(),
    expiresAt: paymentExpiresAt,
  });
  const order: StoredOrder = {
    id: newId("ord"),
    externalReference: reference,
    alumno: account?.name ?? input.nombre,
    email: input.email.toLowerCase(),
    dniPasswordHash: account ? undefined : await hashPassword(input.dni),
    curso: course.title,
    courseSlug: course.slug,
    courseId: course.legacyId,
    monto: course.price,
    montoCents: course.priceCents,
    fecha: todayLabel(),
    metodo: "Mercado Pago",
    estado: "Pendiente",
    createdAt: nowIso(),
    paymentProvider: "mercadopago",
    preferenceId: preference.id,
    paymentUrl: preference.url,
    paymentExpiresAt,
  };

  let createdOrder: StoredOrder;
  let enrollment: StoredEnrollment;
  try {
    ({ createdOrder, enrollment } = await persistCheckoutRecords(order));
  } catch (error) {
    if (error instanceof ApiError && error.code === "CONFLICT") {
      const saved = await getRepositories().enrollments.findByStudentAndCourse(input.email, course.legacyId);
      if (saved) return resumeCheckout(input, course, account, saved);
    }
    throw error;
  }
  logger.debug("checkout_created", { reference, courseId: course.legacyId, paymentMethod: "mercadopago",
    amountCents: course.priceCents, orderId: createdOrder.id });

  return {
    order: orderToDTO(createdOrder),
    enrollment: enrollmentToDTO(enrollment, course),
    payment: { provider: "mercadopago", preferenceId: preference.id, url: preference.url },
    message: "Solicitud registrada. Completá el pago en Mercado Pago; el acceso se activará al confirmarse.",
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
