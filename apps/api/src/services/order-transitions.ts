import type { OrderStatus } from "@rozenblum/shared";
import { badRequest, conflict, notFound } from "../lib/http.js";
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
  { source: "manual"; actorId: string; providerEventId?: never; providerPaymentId?: never; paymentStatus?: never }
  | { source: "mercadopago"; providerEventId: string; providerPaymentId: string; paymentStatus: string; actorId?: never }
);

function allowedTransition(previous: OrderStatus, next: OrderStatus, source: Transition["source"]): boolean {
  if (previous === next) return true;
  if (previous === "Reembolsado") return false;
  if (previous === "Pagado") return next === "Reembolsado" ||
    (source === "mercadopago" && next === "En disputa");
  if (previous === "En disputa") return source === "mercadopago" &&
    (next === "Pagado" || next === "Reembolsado");
  if (next === "En disputa") return source === "mercadopago";
  if (next === "Reembolsado") return source === "mercadopago";
  return true;
}

async function activateEnrollment(order: StoredOrder): Promise<void> {
  const repos = getRepositories();
  const account = await repos.users.findByEmail(order.email);
  if (account && account.role !== "alumno") {
    throw conflict("El correo de la orden pertenece a otra clase de cuenta.");
  }
  if (!account) {
    if (!order.dniPasswordHash) {
      throw badRequest("La orden no tiene una credencial protegida para crear al alumno.");
    }
    await repos.users.create({
      name: order.alumno, email: order.email, role: "alumno",
      passwordHash: order.dniPasswordHash,
      initials: initialsFromName(order.alumno), sessionVersion: 0,
    });
  }
  const enrollment = await repos.enrollments.findByStudentAndCourse(order.email, order.courseId);
  if (enrollment) {
    await repos.enrollments.updateStatus(enrollment.id, "Activo");
  } else {
    await repos.enrollments.create({
      studentEmail: order.email, studentName: order.alumno,
      courseId: order.courseId, status: "Activo",
    });
  }
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
        if (input.source === "mercadopago" && order.paymentId &&
            order.paymentId !== input.providerPaymentId) return null;
        if (!allowedTransition(order.estado, input.status, input.source)) {
          if (input.source === "manual") throw badRequest("Transición de estado no permitida.");
          // A delayed provider event must never undo a payment or a refund.
          return null;
        }
        if (input.source === "manual" && order.estado === input.status) {
          throw badRequest("La orden ya tiene ese estado.");
        }
        if (order.estado !== input.status) {
          if (input.status === "Pagado") {
            await activateEnrollment(order);
          } else {
            const enrollment = await repos.enrollments.findByStudentAndCourse(order.email, order.courseId);
            if (enrollment) {
              await repos.enrollments.updateStatus(enrollment.id,
                input.status === "Pendiente" ? "Pendiente" : "Revocado");
            }
          }
          await repos.orders.updateStatus(order.id, input.status, input.providerPaymentId);
        }
        const event: StoredPaymentEvent = {
          id: newId("pev"), orderId: order.id, source: input.source,
          previousStatus: order.estado, nextStatus: input.status,
          reason: input.reason, createdAt: nowIso(),
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
