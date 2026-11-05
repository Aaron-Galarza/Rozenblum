import type { OrderStatus } from "@rozenblum/shared";
import type { OrderRepository, PaymentEventRepository } from "./interfaces.js";
import { clone, type Memory } from "./mock-memory.js";

export function createMockPaymentsRepositories(db: Memory) {
  const orders: OrderRepository = {
    async list() {
      return [...db.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
    },
    async existsByCourse(courseId) {
      return db.orders.some((item) => item.courseId === courseId);
    },
    async findByReference(reference) {
      const order = db.orders.find(
        (o) => o.externalReference === reference || o.id === reference,
      );
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
