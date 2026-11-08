import { ContactModel, HomeContentModel, SettingsModel } from "../models/index.js";
import { LIST_HARD_LIMIT } from "../lib/pagination.js";
import { nowIso } from "../lib/utils.js";
import type { StoredContact, StoredSettings } from "../types.js";
import type { ContactRepository, HomeRepository, SettingsRepository } from "./interfaces.js";
import { clean } from "./mongoose-common.js";

export function createMongooseContentRepositories() {
  const settings: SettingsRepository = {
    async get() {
      const doc = await SettingsModel.findOne({}).lean().exec();
      return doc ? clean<StoredSettings>(doc) : null;
    },
    async update(patch) {
      const doc = await SettingsModel.findOneAndUpdate(
        {},
        { $set: { ...patch, updatedAt: nowIso() } },
        { returnDocument: "after", upsert: true },
      )
        .lean()
        .exec();
      return clean<StoredSettings>(doc);
    },
  };
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
    async updateHeroImage(previousUrl, nextUrl) {
      const doc = await HomeContentModel.findOneAndUpdate(
        { key: "home", "brand.heroImage": previousUrl },
        { $set: { "brand.heroImage": nextUrl } },
        { returnDocument: "after" },
      ).select("-_id").lean().exec();
      return doc ?? null;
    },
  };
  return { settings, contacts, home };
}
