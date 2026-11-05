import type { OrderStatus } from "@rozenblum/shared";
import { OrderModel, PaymentEventModel } from "../models/index.js";
import { LIST_HARD_LIMIT } from "../lib/pagination.js";
import type { StoredOrder, StoredPaymentEvent } from "../types.js";
import type { OrderRepository, PaymentEventRepository } from "./interfaces.js";
import { clean } from "./mongoose-common.js";

export function createMongoosePaymentsRepositories() {
  const orders: OrderRepository = {
    async list() {
      const docs = await OrderModel.find({})
        .sort({ createdAt: -1 })
        .limit(LIST_HARD_LIMIT)
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredOrder>(doc));
    },
    async existsByCourse(courseId) {
      return Boolean(await OrderModel.exists({ courseId }));
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
