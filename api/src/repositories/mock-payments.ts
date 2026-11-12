import type { OrderStatus } from "@rozenblum/shared";
import type { OrderMetrics, OrderRepository, PaymentEventRepository } from "./interfaces.js";
import { clone, type Memory } from "./mock-memory.js";

/** Mirrors the Mongoose filter: MP revenue needs a bound payment id. */
function isConfirmedPaid(order: { estado: OrderStatus; paymentProvider?: string; paymentId?: string }) {
  return order.estado === "Pagado" &&
    (order.paymentProvider !== "mercadopago" || Boolean(order.paymentId));
}
function isVisibleForAdmin(order: { estado: OrderStatus; paymentProvider?: string; paymentId?: string }) {
  return order.paymentProvider !== "mercadopago" ||
    (["Pagado", "En disputa", "Reembolsado"].includes(order.estado) && Boolean(order.paymentId));
}

export function createMockPaymentsRepositories(db: Memory) {
  const orders: OrderRepository = {
    async list(page) {
      const items = [...db.orders]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(clone);
      return page ? items.slice(page.offset, page.offset + page.limit) : items;
    },
    async listVisibleForAdmin(page) {
      const items = db.orders.filter(isVisibleForAdmin)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
      return page ? items.slice(page.offset, page.offset + page.limit) : items;
    },
    async countVisibleForAdmin() {
      return db.orders.filter(isVisibleForAdmin).length;
    },
    async *iterateVisibleForAdmin() {
      const rows = db.orders.filter(isVisibleForAdmin)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      for (const row of rows) yield clone(row);
    },
    async metrics() {
      const paid = db.orders.filter(isConfirmedPaid);
      const monthly = new Map<string, number>();
      const firstPaymentByOrder = new Map<string, string>();
      for (const event of db.paymentEvents) {
        if (event.nextStatus !== "Pagado") continue;
        const previous = firstPaymentByOrder.get(event.orderId);
        if (!previous || event.createdAt < previous) {
          firstPaymentByOrder.set(event.orderId, event.createdAt);
        }
      }
      for (const order of paid) {
        const month = (firstPaymentByOrder.get(order.id) ?? order.createdAt).slice(0, 7);
        monthly.set(month, (monthly.get(month) ?? 0) + order.montoCents);
      }
      const metrics: OrderMetrics = {
        total: db.orders.filter(isVisibleForAdmin).length,
        paidCount: paid.length,
        paidCents: paid.reduce((sum, order) => sum + order.montoCents, 0),
        paidMonthly: [...monthly.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, cents]) => ({ month, cents })),
      };
      return metrics;
    },
    async existsByCourse(courseId) {
      return db.orders.some((item) => item.courseId === courseId);
    },
    async hasUnsettledPaymentByCourse(courseId) {
      return db.orders.some((order) => order.courseId === courseId &&
        order.paymentProvider === "mercadopago" &&
        (order.estado === "Pendiente" || order.estado === "Rechazado"));
    },
    async findByReference(reference) {
      const order = db.orders.find(
        (o) => o.externalReference === reference || o.id === reference,
      );
      return order ? clone(order) : null;
    },
    async findLatestByStudentAndCourse(email, courseId) {
      const order = db.orders.filter((item) => item.email === email.toLowerCase() && item.courseId === courseId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return order ? clone(order) : null;
    },
    async create(input) {
      db.orders.push(clone(input));
      return clone(input);
    },
    async updateStatus(id, estado: OrderStatus, paymentId) {
      const order = db.orders.find((o) => o.id === id);
      if (!order) return null;
      order.estado = estado;
      if (paymentId) order.paymentId = paymentId;
      return clone(order);
    },
  };
  const paymentEvents: PaymentEventRepository = {
    async findByProviderEventId(providerEventId) {
      return db.paymentEvents.find((event) => event.providerEventId === providerEventId) ?? null;
    },
    async listByOrder(orderId) {
      return db.paymentEvents.filter((event) => event.orderId === orderId).map(clone);
    },
    async create(event) {
      if (event.providerEventId && db.paymentEvents.some((item) => item.providerEventId === event.providerEventId)) {
        throw Object.assign(new Error("Evento duplicado."), { code: 11000 });
      }
      db.paymentEvents.push(clone(event));
      return clone(event);
    },
  };
  return { orders, paymentEvents };
}
