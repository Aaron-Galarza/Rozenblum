import type { AdminEventRepository } from "./interfaces.js";
import { clone, type Memory } from "./mock-memory.js";

export function createMockAdminEventRepository(db: Memory) {
  const adminEvents: AdminEventRepository = {
    async create(event) {
      db.adminEvents.push(clone(event));
      return clone(event);
    },
    async list(page, entity) {
      const items = [...db.adminEvents]
        .filter((event) => !entity || event.entity === entity)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .map(clone);
      return page ? items.slice(page.offset, page.offset + page.limit) : items;
    },
    async count(entity) {
      return db.adminEvents.filter((event) => !entity || event.entity === entity).length;
    },
  };
  return { adminEvents };
}
