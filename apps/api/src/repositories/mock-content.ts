import { nowIso } from "../lib/utils.js";
import type { ContactRepository, HomeRepository, SettingsRepository } from "./interfaces.js";
import { clone, type Memory } from "./mock-memory.js";

export function createMockContentRepositories(db: Memory) {
  const settings: SettingsRepository = {
    async get() {
      return db.settings ? clone(db.settings) : null;
    },
    async update(patch) {
      db.settings = { ...db.settings, ...clone(patch), updatedAt: nowIso() } as NonNullable<typeof db.settings>;
      return clone(db.settings);
    },
  };
  const contacts: ContactRepository = {
    async list(page) {
      const items = [...db.contacts]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .map(clone);
      return page ? items.slice(page.offset, page.offset + page.limit) : items;
    },
    async create(input) {
      db.contacts.push(clone(input));
      return clone(input);
    },
  };
  const home: HomeRepository = {
    async get() {
      return db.homeContent ? clone(db.homeContent) : null;
    },
    async updateHeroImage(previousUrl, nextUrl) {
      if (!db.homeContent || db.homeContent.brand.heroImage !== previousUrl) return null;
      db.homeContent.brand.heroImage = nextUrl;
      return clone(db.homeContent);
    },
  };
  return { settings, contacts, home };
}
