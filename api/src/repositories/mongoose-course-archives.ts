import { CourseArchiveModel } from "../models/index.js";
import type { StoredCourseArchive } from "../types.js";
import type { CourseArchiveRepository } from "./interfaces.js";
import { clean } from "./mongoose-common.js";

export function createMongooseCourseArchiveRepository(): CourseArchiveRepository {
  return {
    async findByCourseId(courseId) {
      const doc = await CourseArchiveModel.findOne({ courseId }).lean().exec();
      return doc ? clean<StoredCourseArchive>(doc) : null;
    },
    async list(page) {
      const query = CourseArchiveModel.find({}).sort({ archivedAt: -1, courseId: -1 });
      if (page) query.skip(page.offset).limit(page.limit);
      return (await query.lean().exec()).map((doc) => clean<StoredCourseArchive>(doc));
    },
    async count() {
      return CourseArchiveModel.countDocuments({}).exec();
    },
    async create(archive) {
      await CourseArchiveModel.create(archive);
    },
  };
}
