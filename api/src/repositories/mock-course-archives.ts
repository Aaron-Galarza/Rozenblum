import type { CourseArchiveRepository } from "./interfaces.js";
import { clone, type Memory } from "./mock-memory.js";

export function createMockCourseArchiveRepository(db: Memory): CourseArchiveRepository {
  return {
    async findByCourseId(courseId) {
      const archive = db.courseArchives.find((item) => item.courseId === courseId);
      return archive ? clone(archive) : null;
    },
    async list(page) {
      const sorted = [...db.courseArchives].sort((a, b) =>
        b.archivedAt.localeCompare(a.archivedAt) || b.courseId - a.courseId);
      return clone(page ? sorted.slice(page.offset, page.offset + page.limit) : sorted);
    },
    async count() { return db.courseArchives.length; },
    async create(archive) {
      if (db.courseArchives.some((item) => item.courseId === archive.courseId || item.slug === archive.slug)) {
        throw Object.assign(new Error("Curso archivado duplicado."), { code: 11000 });
      }
      db.courseArchives.push(clone(archive));
    },
  };
}
