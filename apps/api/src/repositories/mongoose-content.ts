import { ContactModel, HomeContentModel } from "../models/index.js";
import { LIST_HARD_LIMIT } from "../lib/pagination.js";
import type { StoredContact } from "../types.js";
import type { ContactRepository, HomeRepository } from "./interfaces.js";
import { clean } from "./mongoose-common.js";

export function createMongooseContentRepositories() {
  const contacts: ContactRepository = {
    async list(page) {
      const docs = await ContactModel.find({})
        .sort({ createdAt: -1, id: -1 })
        .skip(page?.offset ?? 0)
        .limit(page?.limit ?? LIST_HARD_LIMIT)
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredContact>(doc));
    },
    async create(input) {
      const doc = await ContactModel.create(input);
      return clean<StoredContact>(doc.toObject());
    },
  };
  const home: HomeRepository = {
    async get() {
      const doc = await HomeContentModel.findOne({ key: "home" }).select("-_id").lean().exec();
      return doc ?? null;
    },
  };
  return { contacts, home };
}
