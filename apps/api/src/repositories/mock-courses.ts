import { formatArs, nowIso, slugify } from "../lib/utils.js";
import type { PublicCourseRecord, StoredCourse } from "../types.js";
import type { CourseRepository } from "./interfaces.js";
import { clone, type Memory } from "./mock-memory.js";

export function createMockCoursesRepositories(db: Memory) {
  const courses: CourseRepository = {
    async list() {
      return db.courses.map(clone);
    },
    async countByStatus() {
      return {
        published: db.courses.filter((course) => course.status === "published").length,
        draft: db.courses.filter((course) => course.status === "draft").length,
      };
    },
    async listPublished() {
      return db.courses.filter((course) => course.status === "published").map((course): PublicCourseRecord => ({
        legacyId: course.legacyId,
        slug: course.slug,
        title: course.title,
        description: course.description,
        price: course.price,
        priceCents: course.priceCents,
        duration: course.duration,
        level: course.level,
        img: course.img,
        professor: course.professor,
        status: course.status,
        temario: clone(course.temario),
        modules: course.modules.map(({ id }) => ({ id })),
      }));
    },
    async findLatestPublished() {
      const latest = db.courses
        .filter((c) => c.status === "published")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.legacyId - a.legacyId)[0];
      return latest ? clone(latest) : null;
    },
    async findBySlug(slug) {
      const course = db.courses.find((c) => c.slug === slug);
      return course ? clone(course) : null;
    },
    async findById(legacyId) {
      const course = db.courses.find((c) => c.legacyId === legacyId);
      return course ? clone(course) : null;
    },
    async findByRequestId(requestId) {
      const course = db.courses.find((c) => c.requestId === requestId);
      return course ? clone(course) : null;
    },
    async nextLegacyId() {
      return db.courses.reduce((max, c) => Math.max(max, c.legacyId), 0) + 1;
    },
    async create(input) {
      if (input.requestId) {
        const existing = db.courses.find((c) => c.requestId === input.requestId);
        if (existing) return clone(existing);
      }
      const legacyId = await this.nextLegacyId();
      const baseSlug = slugify(input.title);
      let slug = baseSlug;
      let suffix = 2;
      while (db.courses.some((c) => c.slug === slug)) {
        slug = `${baseSlug}-${suffix++}`;
      }
      const course: StoredCourse = {
        legacyId,
        slug,
        title: input.title,
        description: input.description,
        price: formatArs(input.priceCents),
        priceCents: input.priceCents,
        duration: input.duration,
        level: input.level,
        img: input.img,
        professor: input.professor,
        professorEmail: input.professorEmail,
        status: input.status,
        temario: [],
        modules: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
        revision: 0,
        everPublished: input.status === "published",
        nextLessonNumber: 0,
        requestId: input.requestId,
        accessDays: input.accessDays,
      };
      db.courses.push(course);
      return clone(course);
    },
    async update(legacyId, patch, expectedRevision) {
      const course = db.courses.find((c) => c.legacyId === legacyId);
      if (!course || (course.revision ?? 0) !== expectedRevision) return null;
      Object.assign(course, patch);
      if (patch.priceCents !== undefined) course.price = formatArs(patch.priceCents);
      course.updatedAt = nowIso();
      course.revision = expectedRevision + 1;
      return clone(course);
    },
    async saveModules(legacyId, modules, expectedRevision, nextLessonNumber) {
      const course = db.courses.find((c) => c.legacyId === legacyId);
      if (!course || (course.revision ?? 0) !== expectedRevision) return null;
      course.modules = clone(modules);
      course.updatedAt = nowIso();
      course.revision = expectedRevision + 1;
      if (nextLessonNumber !== undefined) course.nextLessonNumber = nextLessonNumber;
      return clone(course);
    },
    async delete(legacyId, expectedRevision) {
      const index = db.courses.findIndex((c) =>
        c.legacyId === legacyId && (c.revision ?? 0) === expectedRevision,
      );
      if (index === -1) return false;
      db.courses.splice(index, 1);
      return true;
    },
  };
  return { courses };
}
