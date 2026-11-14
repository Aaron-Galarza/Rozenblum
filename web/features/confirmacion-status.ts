import type { OrderDTO } from "@rozenblum/shared";

export type ConfirmationTone = "approved" | "pending" | "review" | "rejected" | "refunded" | "neutral";

export type ConfirmationView = {
  tone: ConfirmationTone;
  title: string;
  summary: string;
  badge: string;
  detail: string;
  /** Only true when the backend reports a confirmed payment with automatic access. */
  approved: boolean;
  /** The order cannot leave this status again (currently only a registered refund). */
  terminal: boolean;
};

export function isRegistrationClosed(order: OrderDTO | null, now = Date.now()): boolean {
  if (order?.estado === "Vencido") return true;
  if (!order?.paymentExpiresAt) return false;
  const closesAt = Date.parse(order.paymentExpiresAt);
  return Number.isFinite(closesAt) && closesAt <= now;
}

export function isTerminalOrder(order: OrderDTO | null): boolean {
  return order?.estado === "Reembolsado";
}

export function confirmationView(
  order: OrderDTO | null,
  options: { error?: string; now?: number } = {},
): ConfirmationView {
  const now = options.now ?? Date.now();
  if (!order) {
    return options.error
      ? {
        tone: "neutral",
        title: "No pudimos consultar tu orden",
        summary: "Revisá el enlace de confirmación o contactá al Estudio.",
        badge: "Consulta fallida",
        detail: "No se pudo consultar el estado de la orden.",
        approved: false,
        terminal: false,
      }
      : {
        tone: "neutral",
        title: "Consultando tu orden",
        summary: "Estamos consultando el estado de tu inscripción.",
        badge: "Consultando",
        detail: "Esperá unos segundos mientras verificamos la orden.",
        approved: false,
        terminal: false,
      };
  }

  const courseClosed = order.fulfillmentIssue === "course_closed";
  const latePayment = order.fulfillmentIssue === "payment_expired";
  const registrationClosed = isRegistrationClosed(order, now);
  const terminal = isTerminalOrder(order);

  if (order.estado === "Pagado" && (courseClosed || latePayment)) {
    return {
      tone: "review",
      title: "Pago recibido fuera de plazo",
      summary: latePayment
        ? "Mercado Pago registró un cobro después de vencer la orden. No habilitamos el aula; contactá al Estudio con tu número de orden."
        : "El curso ya cerró y no se habilitó el aula. Conservá tu número de orden y contactá al Estudio para resolver el cobro.",
      badge: "Cobro para revisar",
      detail: latePayment
        ? "El pago se acreditó después del plazo de cinco minutos; el acceso no se activó automáticamente."
        : "El pago se acreditó después del cierre del curso; el acceso no se activó automáticamente.",
      approved: false,
      terminal,
    };
  }
  if (order.estado === "Reembolsado") {
    return {
      tone: "refunded",
      title: "Pago devuelto",
      summary: "Mercado Pago registró la devolución. El acceso al aula no está habilitado.",
      badge: "Devolución registrada",
      detail: "El acceso al aula no está habilitado.",
      approved: false,
      terminal: true,
    };
  }
  if (order.estado === "En disputa") {
    return {
      tone: "review",
      title: "Pago en disputa",
      summary: "Mercado Pago informó una disputa sobre este pago. El acceso queda en revisión hasta que se resuelva.",
      badge: "En revisión",
      detail: `El acceso queda en revisión hasta que se resuelva.${courseClosed ? " El curso ya cerró." : ""}`,
      approved: false,
      terminal,
    };
  }
  if (courseClosed) {
    return {
      tone: "neutral",
      title: "Curso finalizado",
      summary: "El curso finalizó y este enlace de pago ya no está disponible.",
      badge: "Inscripción cerrada",
      detail: "El curso ya cerró antes de confirmarse el acceso.",
      approved: false,
      terminal,
    };
  }
  if (registrationClosed && order.estado !== "Pagado") {
    return {
      tone: "neutral",
      title: "Orden vencida",
      summary: "Pasaron cinco minutos sin confirmación. La orden y su enlace de pago vencieron. Si realizaste un pago, contactanos con el número de orden.",
      badge: "Inscripción cerrada",
      detail: "El enlace de pago ya venció.",
      approved: false,
      terminal,
    };
  }
  if (order.estado === "Pagado") {
    return {
      tone: "approved",
      title: "¡Pago confirmado!",
      summary: "Tu acceso al aula ya está habilitado.",
      badge: "Acceso habilitado",
      detail: "Mercado Pago confirmó el pago.",
      approved: true,
      terminal,
    };
  }
  if (order.estado === "Rechazado") {
    return {
      tone: "rejected",
      title: "Pago rechazado",
      summary: "Mercado Pago rechazó el pago. No se habilitó el acceso.",
      badge: "Pago rechazado",
      detail: "Si el enlace de pago sigue vigente, podés reintentar el pago desde esta página.",
      approved: false,
      terminal,
    };
  }
  if (order.estado === "Pendiente") {
    return {
      tone: "pending",
      title: "Inscripción pendiente de pago",
      summary: "Registramos tu solicitud, pero el pago todavía no está confirmado.",
      badge: "Pago pendiente",
      detail: "Completá el pago en Mercado Pago para activar el acceso.",
      approved: false,
      terminal,
    };
  }
  return {
    tone: "neutral",
    title: "Estado de la inscripción",
    summary: "Consultamos el estado de tu orden.",
    badge: "Estado de la inscripción",
    detail: `La orden está ${order.estado}.`,
    approved: false,
    terminal,
  };
}
