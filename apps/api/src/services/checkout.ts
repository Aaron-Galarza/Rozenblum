import type {
  CheckoutInput,
  CheckoutResultDTO,
  OrderDTO,
} from "@rozenblum/shared";
import { badRequest, notFound } from "../lib/http.js";
import { hashPassword } from "../lib/password.js";
import { newId, nowIso } from "../lib/utils.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredOrder, StoredUser } from "../types.js";
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

export async function checkout(
  input: CheckoutInput,
  /** Present when the caller sent a valid session (see `optionalAuth`). */
  actor?: StoredUser,
): Promise<CheckoutResultDTO> {
  const { course, teacher, account } = await resolveCheckoutParticipants(input, actor);
  // The account is created only after a verified or manually confirmed payment.
  const reference = `RB-${new Date().getFullYear()}-${newId("ref").slice(4).toUpperCase()}`;
  const gateway = paymentGateway();
  const paymentMethod = input.paymentMethod ?? (gateway ? "mercadopago" : "manual");
  if (paymentMethod === "mercadopago" && !gateway) {
    throw badRequest("Mercado Pago no está configurado. Elegí pago manual.");
  }
  if (paymentMethod === "mercadopago" && course.priceCents <= 0) {
    throw badRequest("Este curso no tiene un importe válido para Mercado Pago.");
  }
  const preference = paymentMethod === "mercadopago"
    ? await gateway!.createPreference({
        reference, courseId: course.legacyId, title: course.title,
        priceCents: course.priceCents, email: input.email.toLowerCase(),
      })
    : null;
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
    metodo: paymentMethod === "mercadopago" ? "Mercado Pago" : "Pago manual",
    estado: "Pendiente",
    createdAt: nowIso(),
    paymentProvider: paymentMethod,
    preferenceId: preference?.id,
    paymentUrl: preference?.url,
  };

  const { createdOrder, enrollment } = await persistCheckoutRecords(order, teacher);

  return {
    order: orderToDTO(createdOrder),
    enrollment: enrollmentToDTO(enrollment, course),
    ...(preference ? { payment: { provider: "mercadopago" as const,
      preferenceId: preference.id, url: preference.url } } : {}),
    message: preference
      ? "Solicitud registrada. Completá el pago en Mercado Pago; el acceso se activará al confirmarse."
      : "Solicitud registrada. Contactanos para coordinar el pago; un administrador confirmará el acceso al aula.",
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
