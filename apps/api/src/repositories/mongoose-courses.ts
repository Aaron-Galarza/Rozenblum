import { CourseModel } from "../models/index.js";
import { formatArs, nowIso, slugify } from "../lib/utils.js";
import type { StoredCourse, StoredModule, PublicCourseRecord } from "../types.js";
import type { CourseRepository } from "./interfaces.js";
import { clean, courseRevisionFilter } from "./mongoose-common.js";

export function createMongooseCoursesRepositories() {
  const courses: CourseRepository = {
    async list() {
      const docs = await CourseModel.find({}).sort({ legacyId: 1 }).lean().exec();
      return docs.map((doc) => clean<StoredCourse>(doc));
    },
    async listPublished() {
      const docs = await CourseModel.find({ status: "published" })
        .select("legacyId slug title description price priceCents duration level img professor accessDays status temario modules.id")
        .sort({ legacyId: 1 })
        .lean()
        .exec();
      return docs.map((doc) => clean<PublicCourseRecord>(doc));
    },
    async findLatestPublished() {
      const doc = await CourseModel.findOne({ status: "published" })
        .sort({ createdAt: -1, legacyId: -1 })
        .lean()
        .exec();
      return doc ? clean<StoredCourse>(doc) : null;
    },
    async findBySlug(slug) {
      const doc = await CourseModel.findOne({ slug }).lean().exec();
      return doc ? clean<StoredCourse>(doc) : null;
    },
    async findById(legacyId) {
      const doc = await CourseModel.findOne({ legacyId }).lean().exec();
      return doc ? clean<StoredCourse>(doc) : null;
    },
    async findByRequestId(requestId) {
      const doc = await CourseModel.findOne({ requestId }).lean().exec();
      return doc ? clean<StoredCourse>(doc) : null;
    },
    async nextLegacyId() {
      const doc = await CourseModel.findOne({}).sort({ legacyId: -1 }).select("legacyId").lean().exec();
      return (doc?.legacyId ?? 0) + 1;
    },
    async create(input) {
      const baseSlug = slugify(input.title);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const legacyId = await this.nextLegacyId();
        let slug = baseSlug;
        let suffix = 2;
        while (await CourseModel.exists({ slug })) {
          slug = `${baseSlug}-${suffix++}`;
        }
        try {
          const doc = await CourseModel.create({
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
          });
          return clean<StoredCourse>(doc.toObject());
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
          // A retried creation may collide with its own idempotency key. Return
          // the resource created by the first attempt instead of duplicating it.
          if (input.requestId) {
            const existing = await CourseModel.findOne({ requestId: input.requestId }).lean().exec();
            if (existing) return clean<StoredCourse>(existing);
          }
          if (attempt === 4) throw error;
          // Another request claimed the slug or legacy ID after our lookup.
          // Re-read both values rather than turning a normal race into a 500.
        }
      }
      throw new Error("No se pudo crear el curso.");
    },
    async update(legacyId, patch, expectedRevision) {
      const update: Record<string, unknown> = { ...patch, updatedAt: nowIso() };
      if (patch.priceCents !== undefined) update.price = formatArs(patch.priceCents);
      const doc = await CourseModel.findOneAndUpdate(
        { legacyId, ...courseRevisionFilter(expectedRevision) },
        { $set: update, $inc: { revision: 1 } },
        { returnDocument: "after" },
      )
        .lean()
        .exec();
      return doc ? clean<StoredCourse>(doc) : null;
    },
    async saveModules(legacyId, modules: StoredModule[], expectedRevision, nextLessonNumber) {
      const update = {
        modules,
        updatedAt: nowIso(),
        ...(nextLessonNumber === undefined ? {} : { nextLessonNumber }),
      };
      const doc = await CourseModel.findOneAndUpdate(
        { legacyId, ...courseRevisionFilter(expectedRevision) },
        { $set: update, $inc: { revision: 1 } },
        { returnDocument: "after" },
      )
        .lean()
        .exec();
      return doc ? clean<StoredCourse>(doc) : null;
    },
    async delete(legacyId, expectedRevision) {
      const result = await CourseModel.deleteOne({
        legacyId,
        ...courseRevisionFilter(expectedRevision),
        status: "draft",
        everPublished: { $ne: true },
      }).exec();
      return result.deletedCount === 1;
    },
  };
  return { courses };
}
