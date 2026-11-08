import type { ContactRepository, HomeRepository } from "./interfaces.js";
import { clone, type Memory } from "./mock-memory.js";

export function createMockContentRepositories(db: Memory) {
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
  };
  return { contacts, home };
}
