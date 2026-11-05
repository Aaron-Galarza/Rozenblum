import type { Role } from "@rozenblum/shared";
import { UserModel, EnrollmentModel } from "../models/index.js";
import { newId, nowIso } from "../lib/utils.js";
import { LIST_HARD_LIMIT } from "../lib/pagination.js";
import type { StoredUser, StoredEnrollment } from "../types.js";
import type { UserRepository, EnrollmentRepository } from "./interfaces.js";
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
    async list(role: Role | undefined, page) {
      const docs = await UserModel.find(role ? { role } : {})
        .sort({ name: 1 })
        .skip(page?.offset ?? 0)
        .limit(page?.limit ?? LIST_HARD_LIMIT)
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredUser>(doc));
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
    async existsByCourse(courseId) {
      return Boolean(await EnrollmentModel.exists({ courseId }));
    },
    async listByStudent(email) {
      const docs = await EnrollmentModel.find({ studentEmail: email.toLowerCase() })
        .sort({ startedAt: -1 })
        .lean()
        .exec();
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
      });
      return clean<StoredEnrollment>(doc.toObject());
    },
    async setCompletedLessons(id, lessonIds) {
      const doc = await EnrollmentModel.findOneAndUpdate(
        { id },
        { $set: { completedLessonIds: [...new Set(lessonIds)] } },
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
    async deleteByStudent(email) {
      const result = await EnrollmentModel.deleteMany({
        studentEmail: email.toLowerCase(),
      }).exec();
      return result.deletedCount ?? 0;
    },
  };
  return { users, enrollments };
}
