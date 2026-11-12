import type { OrderStatus } from "@rozenblum/shared";
import { OrderModel, PaymentEventModel } from "../models/index.js";
import { LIST_HARD_LIMIT } from "../lib/pagination.js";
import type { StoredOrder, StoredPaymentEvent } from "../types.js";
import type { OrderMetrics, OrderRepository, PaymentEventRepository } from "./interfaces.js";
import { clean } from "./mongoose-common.js";

/**
 * A manual order counts as revenue once an administrator marks it paid.
 * A Mercado Pago order only counts when the gateway bound a payment id, so a
 * record left inconsistent by a failed notification is never reported as sold.
 */
const CONFIRMED_PAID_FILTER = {
  estado: "Pagado",
  $or: [
    { paymentProvider: { $ne: "mercadopago" } },
    { paymentId: { $type: "string" } },
  ],
};
const ADMIN_VISIBLE_FILTER = {
  $or: [
    { paymentProvider: { $ne: "mercadopago" as const } },
    { estado: { $in: ["Pagado", "En disputa", "Reembolsado"] satisfies OrderStatus[] },
      paymentId: { $type: "string" as const } },
  ],
};

export function createMongoosePaymentsRepositories() {
  const orders: OrderRepository = {
    async list(page) {
      const docs = await OrderModel.find({})
        .sort({ createdAt: -1 })
        .skip(page?.offset ?? 0)
        .limit(page?.limit ?? LIST_HARD_LIMIT)
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredOrder>(doc));
    },
    async listVisibleForAdmin(page) {
      const docs = await OrderModel.find(ADMIN_VISIBLE_FILTER).sort({ createdAt: -1 })
        .skip(page?.offset ?? 0).limit(page?.limit ?? LIST_HARD_LIMIT).lean().exec();
      return docs.map((doc) => clean<StoredOrder>(doc));
    },
    async countVisibleForAdmin() {
      return OrderModel.countDocuments(ADMIN_VISIBLE_FILTER).exec();
    },
    async *iterateVisibleForAdmin() {
      const cursor = OrderModel.find(ADMIN_VISIBLE_FILTER)
        .sort({ createdAt: -1, id: -1 }).lean().cursor();
      try {
        for await (const doc of cursor) yield clean<StoredOrder>(doc);
      } finally {
        await cursor.close();
      }
    },
    async metrics() {
      const [total, totals, monthlyRows] = await Promise.all([
        OrderModel.countDocuments(ADMIN_VISIBLE_FILTER).exec(),
        OrderModel.aggregate<{ _id: null; count: number; cents: number }>([
          { $match: CONFIRMED_PAID_FILTER },
          { $group: { _id: null, count: { $sum: 1 }, cents: { $sum: "$montoCents" } } },
        ]).exec(),
        OrderModel.aggregate<{ _id: string; cents: number }>([
          { $match: CONFIRMED_PAID_FILTER },
          { $lookup: {
            from: "payment_events",
            let: { orderId: "$id" },
            pipeline: [
              { $match: { $expr: { $and: [
                { $eq: ["$orderId", "$$orderId"] }, { $eq: ["$nextStatus", "Pagado"] },
              ] } } },
              { $sort: { createdAt: 1 } },
              { $limit: 1 },
              { $project: { _id: 0, createdAt: 1 } },
            ],
            as: "firstPayment",
          } },
          {
            $group: {
              // Legacy paid orders have no event: retain their original month.
              _id: { $substrBytes: [
                { $ifNull: [{ $arrayElemAt: ["$firstPayment.createdAt", 0] }, "$createdAt"] }, 0, 7,
              ] },
              cents: { $sum: "$montoCents" },
            },
          },
          { $sort: { _id: 1 } },
        ]).exec(),
      ]);
      const metrics: OrderMetrics = {
        total,
        paidCount: totals[0]?.count ?? 0,
        paidCents: totals[0]?.cents ?? 0,
        paidMonthly: monthlyRows.map((row) => ({ month: row._id, cents: row.cents })),
      };
      return metrics;
    },
    async existsByCourse(courseId) {
      return Boolean(await OrderModel.exists({ courseId }));
    },
    async hasUnsettledPaymentByCourse(courseId) {
      return Boolean(await OrderModel.exists({ courseId, paymentProvider: "mercadopago",
        estado: { $in: ["Pendiente", "Rechazado"] } }));
    },
    async findByReference(reference) {
      const doc = await OrderModel.findOne({
        $or: [{ externalReference: reference }, { id: reference }],
      })
        .select("+dniPasswordHash")
        .lean()
        .exec();
      return doc ? clean<StoredOrder>(doc) : null;
    },
    async findLatestByStudentAndCourse(email, courseId) {
      const doc = await OrderModel.findOne({ email: email.toLowerCase(), courseId })
        .sort({ createdAt: -1 }).select("+dniPasswordHash").lean().exec();
      return doc ? clean<StoredOrder>(doc) : null;
    },
    async create(input) {
      const doc = await OrderModel.create(input);
      return clean<StoredOrder>(doc.toObject());
    },
    async updateStatus(id, estado: OrderStatus, paymentId) {
      const doc = await OrderModel.findOneAndUpdate({ id }, {
        $set: { estado, ...(paymentId ? { paymentId } : {}) },
      }, { returnDocument: "after" })
        .select("+dniPasswordHash")
        .lean()
        .exec();
      return doc ? clean<StoredOrder>(doc) : null;
    },
  };
  const paymentEvents: PaymentEventRepository = {
    async findByProviderEventId(providerEventId) {
      const doc = await PaymentEventModel.findOne({ providerEventId }).lean().exec();
      return doc ? clean<StoredPaymentEvent>(doc) : null;
    },
    async listByOrder(orderId) {
      const docs = await PaymentEventModel.find({ orderId }).sort({ createdAt: 1 })
        .limit(LIST_HARD_LIMIT).lean().exec();
      return docs.map((doc) => clean<StoredPaymentEvent>(doc));
    },
    async create(event) {
      const doc = await PaymentEventModel.create(event);
      return clean<StoredPaymentEvent>(doc.toObject());
    },
  };
  return { orders, paymentEvents };
}
