import type { OrderStatus } from "@rozenblum/shared";
import { courseExpiryInstant, isCourseEnrollmentOpen, isCourseExpired } from "../lib/course-expiry.js";
import { badRequest, notFound } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { initialsFromName, newId, nowIso } from "../lib/utils.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredOrder, StoredPaymentEvent } from "../types.js";

type TransitionBase = {
  reference: string;
  status: OrderStatus;
  reason: string;
};
type Transition = TransitionBase & (
  { source: "manual"; actorId: string; providerEventId?: never; providerPaymentId?: never; paymentStatus?: never; approvedAt?: never }
  | { source: "mercadopago"; providerEventId: string; providerPaymentId: string; paymentStatus: string; approvedAt?: string; actorId?: never }
);

function allowedTransition(previous: OrderStatus, next: OrderStatus, source: Transition["source"]): boolean {
  if (previous === next) return true;
  if (previous === "Reembolsado") return false;
  if (previous === "Vencido") return source === "mercadopago" &&
    (next === "Pagado" || next === "En disputa" || next === "Reembolsado");
  if (previous === "Pagado") return next === "Reembolsado" ||
    (source === "mercadopago" && next === "En disputa");
  if (previous === "En disputa") return source === "mercadopago" &&
    (next === "Pagado" || next === "Reembolsado");
  if (next === "En disputa") return source === "mercadopago";
  if (next === "Reembolsado") return source === "mercadopago";
  return true;
}

async function activateEnrollment(order: StoredOrder, approvedAt?: string): Promise<StoredOrder["fulfillmentIssue"]> {
  const repos = getRepositories();
  const course = await repos.courses.findById(order.courseId);
  const approvedTime = approvedAt && Number.isFinite(Date.parse(approvedAt))
    ? Date.parse(approvedAt) : Date.now();
  if (!course || isCourseExpired(course) || !isCourseEnrollmentOpen(course, approvedTime)) {
    return "course_closed";
  }
  if (order.paymentExpiresAt && approvedTime >= Date.parse(order.paymentExpiresAt)) {
    return "payment_expired";
  }
  const account = await repos.users.findByEmail(order.email);
  if (account && (account.role !== "alumno" || account.status !== "Activo" || account.deletedAt)) {
    return "account_unavailable";
  }
  if (account?.studentDniBinding && account.studentDniBinding !== order.dniBinding) {
    return "identity_mismatch";
  }
  if (account && order.dniBinding && !account.studentDniBinding) {
    return "identity_mismatch";
  }
  if (!account) {
    if (!order.dniPasswordHash) return "account_unavailable";
    await repos.users.create({
      name: order.alumno, email: order.email, role: "alumno",
      passwordHash: order.dniPasswordHash,
      studentDniHash: order.dniPasswordHash,
      studentDniBinding: order.dniBinding,
      initials: initialsFromName(order.alumno), sessionVersion: 0,
    });
  }
  // Payment starts the individual access window, capped by the course's
  // final calendar day. Legacy courses may not have a course expiry yet.
  const accessDays = course?.accessDays ?? 0;
  const individualExpiry = accessDays > 0
    ? new Date(Date.now() + accessDays * 86_400_000).toISOString()
    : undefined;
  const courseExpiry = course?.expiresOn ? courseExpiryInstant(course.expiresOn) : undefined;
  const expiresAt = individualExpiry && courseExpiry
    ? individualExpiry < courseExpiry ? individualExpiry : courseExpiry
    : individualExpiry ?? courseExpiry;
  const enrollment = await repos.enrollments.findByStudentAndCourse(order.email, order.courseId);
  if (enrollment) {
    await repos.enrollments.updateStatus(enrollment.id, "Activo");
    await repos.enrollments.setExpiresAt(enrollment.id, expiresAt);
  } else {
    await repos.enrollments.create({
      studentEmail: order.email, studentName: order.alumno,
      courseId: order.courseId, status: "Activo", expiresAt,
    });
  }
  return undefined;
}

export async function applyOrderTransition(input: Transition): Promise<StoredPaymentEvent | null> {
  if (input.source === "manual" && (!input.actorId || input.reason.trim().length < 5)) {
    throw badRequest("El cambio manual requiere administrador y motivo.");
  }
  const repos = getRepositories();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await repos.withTransaction(async () => {
        if (input.providerEventId &&
            await repos.paymentEvents.findByProviderEventId(input.providerEventId)) return null;
        const order = await repos.orders.findByReference(input.reference);
        if (!order) throw notFound("Orden no encontrada.");
        if (input.source === "mercadopago" && order.paymentProvider !== "mercadopago") {
          throw badRequest("La orden no pertenece a Mercado Pago.");
        }
        if (input.source === "manual" && order.paymentProvider === "mercadopago") {
          throw badRequest("Una orden de Mercado Pago requiere verificación automática.");
        }
        // Another payment attempt may have won while this notification was
        // waiting for the transaction. Only the bound payment may revoke it.
        if (input.source === "mercadopago" && order.paymentId && order.estado !== "Rechazado" &&
            order.paymentId !== input.providerPaymentId) return null;
        if (!allowedTransition(order.estado, input.status, input.source)) {
          if (input.source === "manual") throw badRequest("Transición de estado no permitida.");
          // A delayed provider event must never undo a payment or a refund.
          return null;
        }
        if (input.source === "manual" && order.estado === input.status) {
          throw badRequest("La orden ya tiene ese estado.");
        }
        let fulfillmentIssue: StoredOrder["fulfillmentIssue"];
        if (order.estado !== input.status) {
          if (input.status === "Pagado") {
            fulfillmentIssue = await activateEnrollment(order, input.approvedAt);
          } else {
            const enrollment = await repos.enrollments.findByStudentAndCourse(order.email, order.courseId);
            if (enrollment && !(order.estado === "Pendiente" && input.status === "Rechazado")) {
              await repos.enrollments.updateStatus(enrollment.id,
                input.status === "Pendiente" ? "Pendiente" : "Revocado");
            }
          }
          await repos.orders.updateStatus(order.id, input.status,
            input.status === "Rechazado" || input.status === "Pendiente" ? undefined : input.providerPaymentId,
            fulfillmentIssue);
        }
        const event: StoredPaymentEvent = {
          id: newId("pev"), orderId: order.id, source: input.source,
          previousStatus: order.estado, nextStatus: input.status,
          reason: fulfillmentIssue
            ? `${input.reason}. ${fulfillmentIssue === "payment_expired" ? "Plazo de pago vencido" :
              fulfillmentIssue === "identity_mismatch" ? "Datos de la cuenta no coinciden" :
              fulfillmentIssue === "account_unavailable" ? "Cuenta no disponible" : "Curso cerrado"}; acceso no activado.`
            : input.reason,
          createdAt: nowIso(),
          ...(input.actorId ? { actorId: input.actorId } : {}),
          ...(input.providerEventId ? { providerEventId: input.providerEventId } : {}),
          ...(input.providerPaymentId ? { providerPaymentId: input.providerPaymentId } : {}),
          ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
        };
        return repos.paymentEvents.create(event);
      });
      if (result) logger.debug("order_transition", { orderId: result.orderId, source: result.source,
        previousStatus: result.previousStatus, nextStatus: result.nextStatus, eventId: result.id });
      return result;
    } catch (error) {
      if ((error as { code?: number }).code === 11000 && attempt === 0) continue;
      if ((error as { code?: number }).code === 11000 && input.providerEventId &&
          await repos.paymentEvents.findByProviderEventId(input.providerEventId)) return null;
      throw error;
    }
  }
  return null;
}
