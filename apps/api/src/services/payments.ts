import { z } from "zod";
import { badRequest, notFound } from "../lib/http.js";
import { getRepositories } from "../repositories/index.js";
import { paymentGateway, verifyPaymentWebhook } from "./mercadopago.js";
import { applyOrderTransition } from "./order-transitions.js";

export const paymentNotificationSchema = z.object({
  id: z.union([z.string(), z.number()]),
  type: z.literal("payment"),
  data: z.object({ id: z.union([z.string(), z.number()]) }),
}).passthrough();

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
  if (order.paymentId && order.paymentId !== payment.id) return;
  const status = nextOrderStatus(payment.status, payment.statusDetail);
  await applyOrderTransition({
    reference: order.externalReference,
    status: status ?? order.estado, source: "mercadopago",
    providerEventId: String(input.notification.id),
    providerPaymentId: payment.id,
    paymentStatus: payment.status,
    reason: `Mercado Pago: ${payment.status}${payment.statusDetail ? ` (${payment.statusDetail})` : ""}`,
  });
}
