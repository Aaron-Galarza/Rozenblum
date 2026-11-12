import { AdminEventModel } from "../models/index.js";
import { LIST_HARD_LIMIT } from "../lib/pagination.js";
import type { StoredAdminEvent } from "../types.js";
import type { AdminEventRepository } from "./interfaces.js";
import { clean } from "./mongoose-common.js";

export function createMongooseAdminEventRepository() {
  const adminEvents: AdminEventRepository = {
    async create(event) {
      const doc = await AdminEventModel.create(event);
      return clean<StoredAdminEvent>(doc.toObject());
    },
    async list(page, entity) {
      const docs = await AdminEventModel.find(entity ? { entity } : {})
        .sort({ createdAt: -1, id: -1 })
        .skip(page?.offset ?? 0)
        .limit(page?.limit ?? LIST_HARD_LIMIT)
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredAdminEvent>(doc));
    },
    async count(entity) {
      return AdminEventModel.countDocuments(entity ? { entity } : {}).exec();
    },
  };
  return { adminEvents };
}
