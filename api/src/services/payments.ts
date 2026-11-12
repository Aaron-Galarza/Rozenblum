import { z } from "zod";
import { badRequest, notFound } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { getRepositories } from "../repositories/index.js";
import { paymentGateway, verifyPaymentWebhook } from "./mercadopago.js";
import { applyOrderTransition } from "./order-transitions.js";

export const paymentNotificationSchema = z.object({
  id: z.union([z.string(), z.number()]),
  type: z.literal("payment"),
  data: z.object({ id: z.union([z.string(), z.number()]) }),
}).passthrough();

export async function reconcileReturnedPayment(reference: string, email?: string, paymentId?: string) {
  if (paymentId && !/^\d{1,30}$/.test(paymentId)) throw badRequest("Identificador de pago inválido.");
  const order = await getRepositories().orders.findByReference(reference);
  if (!order || (email && order.email.toLowerCase() !== email.trim().toLowerCase()) ||
      (!email && !paymentId) ||
      order.paymentProvider !== "mercadopago") throw notFound("Orden de pago no encontrada.");
  const gateway = paymentGateway();
  if (!gateway) throw badRequest("Mercado Pago no está configurado.");
  const candidateIds = paymentId ? [paymentId] : order.paymentId ? [order.paymentId] :
    await gateway.findPaymentsByReference?.(order.externalReference!) ?? [];
  if (candidateIds.length === 0) return;
  const payments = await Promise.all(candidateIds.map((id) => gateway.getPayment(id)));
  const matching = payments.filter((item) => candidateIds.includes(item.id) &&
    item.externalReference === order.externalReference && item.currency === "ARS" &&
    item.amountCents === order.montoCents);
  const payment = matching.find((item) => item.status === "approved") ?? matching[0];
  if (!payment) {
    throw badRequest("El pago no coincide con la orden.");
  }
  if (order.paymentId && order.estado !== "Rechazado" && order.paymentId !== payment.id) return;
  const status = nextOrderStatus(payment.status, payment.statusDetail);
  if (!status) return;
  if (order.estado === status) return;
  await applyOrderTransition({
    reference: order.externalReference!, status, source: "mercadopago",
    providerEventId: `return:${payment.id}:${payment.status}:${payment.statusDetail}`,
    providerPaymentId: payment.id, paymentStatus: payment.status,
    reason: `Mercado Pago: ${payment.status}${payment.statusDetail ? ` (${payment.statusDetail})` : ""}`,
  });
}

function nextOrderStatus(status: string, detail: string): "Pagado" | "Pendiente" | "Rechazado" | "En disputa" | "Reembolsado" | null {
  switch (status) {
    case "approved": return "Pagado";
    case "pending":
    case "in_process":
    case "authorized": return "Pendiente";
    case "rejected":
    case "cancelled": return "Rechazado";
    case "refunded":
      return "Reembolsado";
    case "charged_back":
      return detail === "reimbursed" ? "Reembolsado" : "En disputa";
    case "in_mediation": return "En disputa";
    default: return null;
  }
}

export async function processPaymentWebhook(input: {
  notification: z.infer<typeof paymentNotificationSchema>;
  queryPaymentId: string;
  xSignature?: string;
  xRequestId?: string;
}): Promise<void> {
  if (String(input.notification.data.id) !== input.queryPaymentId) {
    throw badRequest("La notificación de pago no coincide con su identificador.");
  }
  verifyPaymentWebhook(input.xSignature, input.xRequestId, input.queryPaymentId);
  const gateway = paymentGateway();
  if (!gateway) throw badRequest("Mercado Pago no está configurado.");
  const payment = await gateway.getPayment(input.queryPaymentId);
  if (payment.id !== input.queryPaymentId) throw badRequest("El identificador del pago no coincide.");
  const order = await getRepositories().orders.findByReference(payment.externalReference);
  if (!order || order.paymentProvider !== "mercadopago") throw notFound("Orden de pago no encontrada.");
  if (payment.currency !== "ARS" || payment.amountCents !== order.montoCents) {
    throw badRequest("El importe o la moneda del pago no coincide con la orden.");
  }
  // Multiple payment attempts can share one checkout reference. A refund for a
  // different attempt must not revoke the enrollment activated by this payment.
  if (order.paymentId && order.estado !== "Rechazado" && order.paymentId !== payment.id) return;
  const status = nextOrderStatus(payment.status, payment.statusDetail);
  logger.debug("payment_verified", { reference: order.externalReference, paymentId: payment.id,
    providerStatus: payment.status, nextStatus: status });
  await applyOrderTransition({
    reference: order.externalReference,
    status: status ?? order.estado, source: "mercadopago",
    providerEventId: String(input.notification.id),
    providerPaymentId: payment.id,
    paymentStatus: payment.status,
    reason: `Mercado Pago: ${payment.status}${payment.statusDetail ? ` (${payment.statusDetail})` : ""}`,
  });
}
