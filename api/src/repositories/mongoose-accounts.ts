import type { Role } from "@rozenblum/shared";
import { UserModel, EnrollmentModel } from "../models/index.js";
import { newId, nowIso } from "../lib/utils.js";
import { LIST_HARD_LIMIT } from "../lib/pagination.js";
import type { StoredUser, StoredEnrollment } from "../types.js";
import type {
  EnrollmentMetrics,
  EnrollmentRepository,
  UserCounts,
  UserRepository,
} from "./interfaces.js";
import { clean } from "./mongoose-common.js";

export function createMongooseAccountsRepositories() {
  const users: UserRepository = {
    async findByEmail(email) {
      const doc = await UserModel.findOne({ email: email.toLowerCase() }).lean().exec();
      return doc ? clean<StoredUser>(doc) : null;
    },
    async findById(id) {
      const doc = await UserModel.findOne({ id }).lean().exec();
      return doc ? clean<StoredUser>(doc) : null;
    },
    async findProfessorImagesByIds(ids) {
      if (ids.length === 0) return [];
      const docs = await UserModel.find({ id: { $in: ids }, role: "profesor" })
        .select("id img")
        .lean()
        .exec();
      return docs.map(({ id, img }) => ({ id, img }));
    },
    async list(role, page) {
      const docs = await UserModel.find({
        ...(role ? { role } : {}),
        deletedAt: { $exists: false },
      })
        .sort({ name: 1 })
        .skip(page?.offset ?? 0)
        .limit(page?.limit ?? LIST_HARD_LIMIT)
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredUser>(doc));
    },
    async countByRole() {
      const rows = await UserModel.aggregate<{ _id: Role; count: number }>([
        { $match: { deletedAt: { $exists: false } } },
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]).exec();
      const counts: UserCounts = { alumno: 0, profesor: 0, admin: 0 };
      for (const row of rows) counts[row._id] = row.count;
      return counts;
    },
    async create(input) {
      const doc = await UserModel.create({
        id: newId("usr"),
        name: input.name,
        email: input.email.toLowerCase(),
        role: input.role,
        status: input.status ?? "Activo",
        initials: input.initials,
        img: input.img,
        passwordHash: input.passwordHash,
        sessionVersion: input.sessionVersion ?? 0,
        createdAt: nowIso(),
      });
      return clean<StoredUser>(doc.toObject());
    },
    async update(id, patch, options) {
      const update = { ...patch };
      if (update.email) update.email = update.email.toLowerCase();
      const changes = options?.revokeSessions
        ? { $set: update, $inc: { sessionVersion: 1 } }
        : { $set: update };
      const doc = await UserModel.findOneAndUpdate({ id }, changes, { returnDocument: "after" })
        .lean()
        .exec();
      return doc ? clean<StoredUser>(doc) : null;
    },
    async delete(id) {
      const result = await UserModel.deleteOne({ id }).exec();
      return result.deletedCount === 1;
    },
  };
  const enrollments: EnrollmentRepository = {
    async listAll(page) {
      const docs = await EnrollmentModel.find({})
        .sort({ startedAt: -1 })
        .skip(page?.offset ?? 0)
        .limit(page?.limit ?? LIST_HARD_LIMIT)
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredEnrollment>(doc));
    },
    async listVisibleForAdmin(page) {
      const docs = await EnrollmentModel.find({ status: { $ne: "Pendiente" } })
        .sort({ startedAt: -1 })
        .skip(page?.offset ?? 0)
        .limit(page?.limit ?? LIST_HARD_LIMIT)
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredEnrollment>(doc));
    },
    async countVisibleForAdmin() {
      return EnrollmentModel.countDocuments({ status: { $ne: "Pendiente" } }).exec();
    },
    async *iterateVisibleForAdmin() {
      const cursor = EnrollmentModel.find({ status: { $ne: "Pendiente" } })
        .sort({ startedAt: -1, id: -1 }).lean().cursor();
      try {
        for await (const doc of cursor) yield clean<StoredEnrollment>(doc);
      } finally {
        await cursor.close();
      }
    },
    async listByStudents(emails) {
      if (emails.length === 0) return [];
      const docs = await EnrollmentModel.find({
        studentEmail: { $in: emails.map((email) => email.toLowerCase()) },
      })
        .sort({ startedAt: -1 })
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredEnrollment>(doc));
    },
    async metrics() {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [total, startedLast7Days, activeEmails, monthlyRows, byCourseRows] = await Promise.all([
        EnrollmentModel.countDocuments({ status: { $ne: "Pendiente" } }).exec(),
        EnrollmentModel.countDocuments({ status: { $ne: "Pendiente" }, startedAt: { $gte: sevenDaysAgo } }).exec(),
        EnrollmentModel.distinct("studentEmail", { status: "Activo" }).exec(),
        EnrollmentModel.aggregate<{ _id: string; value: number }>([
          { $match: { status: { $ne: "Pendiente" } } },
          { $group: { _id: { $substrBytes: ["$startedAt", 0, 7] }, value: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]).exec(),
        EnrollmentModel.aggregate<{
          _id: number;
          students: number;
          averageCompletedLessons: number;
        }>([
          { $match: { status: { $ne: "Pendiente" } } },
          {
            $group: {
              _id: "$courseId",
              students: { $sum: 1 },
              averageCompletedLessons: {
                $avg: { $size: { $ifNull: ["$completedLessonIds", []] } },
              },
            },
          },
        ]).exec(),
      ]);
      const metrics: EnrollmentMetrics = {
        total,
        activeStudents: activeEmails.length,
        startedLast7Days,
        monthly: monthlyRows.map((row) => ({ month: row._id, value: row.value })),
        byCourse: byCourseRows.map((row) => ({
          courseId: row._id,
          students: row.students,
          averageCompletedLessons: row.averageCompletedLessons ?? 0,
        })),
      };
      return metrics;
    },
    async existsByCourse(courseId) {
      return Boolean(await EnrollmentModel.exists({ courseId }));
    },
    async archiveSummary(courseId) {
      const filter = { courseId, status: { $ne: "Pendiente" } };
      const [summary, days] = await Promise.all([
        EnrollmentModel.aggregate<{ enrollmentCount: number; completedCount: number; averageCompletedLessons: number }>([
          { $match: filter },
          { $group: { _id: null, enrollmentCount: { $sum: 1 },
            completedCount: { $sum: { $cond: [{ $eq: ["$status", "Completado"] }, 1, 0] } },
            averageCompletedLessons: { $avg: { $size: { $ifNull: ["$completedLessonIds", []] } } },
          } },
        ]).exec(),
        EnrollmentModel.aggregate<{ _id: string; count: number }>([
          { $match: filter },
          { $group: { _id: { $substrBytes: ["$startedAt", 0, 10] }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]).exec(),
      ]);
      return {
        enrollmentCount: summary[0]?.enrollmentCount ?? 0,
        completedCount: summary[0]?.completedCount ?? 0,
        averageCompletedLessons: summary[0]?.averageCompletedLessons ?? 0,
        startedByDay: days.map((day) => ({ day: day._id, count: day.count })),
      };
    },
    async deleteByCourse(courseId) {
      const result = await EnrollmentModel.deleteMany({ courseId }).exec();
      return result.deletedCount ?? 0;
    },
    async listByStudent(email) {
      const docs = await EnrollmentModel.find({ studentEmail: email.toLowerCase() })
        .sort({ startedAt: -1 })
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredEnrollment>(doc));
    },
    async listByCourseIds(courseIds) {
      if (courseIds.length === 0) return [];
      const docs = await EnrollmentModel.find({
        courseId: { $in: courseIds }, status: { $ne: "Pendiente" },
      }).sort({ startedAt: -1, id: -1 }).lean().exec();
      return docs.map((doc) => clean<StoredEnrollment>(doc));
    },
    async findById(id) {
      const doc = await EnrollmentModel.findOne({ id }).lean().exec();
      return doc ? clean<StoredEnrollment>(doc) : null;
    },
    async findByStudentAndCourse(email, courseId) {
      const doc = await EnrollmentModel.findOne({
        studentEmail: email.toLowerCase(),
        courseId,
      })
        .lean()
        .exec();
      return doc ? clean<StoredEnrollment>(doc) : null;
    },
    async create(input) {
      const doc = await EnrollmentModel.create({
        id: newId("enr"),
        studentEmail: input.studentEmail.toLowerCase(),
        studentName: input.studentName,
        courseId: input.courseId,
        status: input.status,
        startedAt: nowIso(),
        completedLessonIds: input.completedLessonIds ?? [],
        expiresAt: input.expiresAt,
      });
      return clean<StoredEnrollment>(doc.toObject());
    },
    async updateCompletedLesson(id, lessonId, completed) {
      const doc = await EnrollmentModel.findOneAndUpdate(
        { id },
        completed
          ? { $addToSet: { completedLessonIds: lessonId } }
          : { $pull: { completedLessonIds: lessonId } },
        { returnDocument: "after" },
      )
        .lean()
        .exec();
      return doc ? clean<StoredEnrollment>(doc) : null;
    },
    async updateStatus(id, status) {
      const doc = await EnrollmentModel.findOneAndUpdate(
        { id },
        { $set: { status } },
        { returnDocument: "after" },
      )
        .lean()
        .exec();
      return doc ? clean<StoredEnrollment>(doc) : null;
    },
    async setExpiresAt(id, expiresAt) {
      const doc = await EnrollmentModel.findOneAndUpdate(
        { id },
        expiresAt
          ? { $set: { expiresAt } }
          : { $unset: { expiresAt: 1 } },
        { returnDocument: "after" },
      )
        .lean()
        .exec();
      return doc ? clean<StoredEnrollment>(doc) : null;
    },
  };
  return { users, enrollments };
}
