import type { OrderStatus, Role } from "@rozenblum/shared";
import {
  ContactModel,
  ConversationModel,
  CourseModel,
  EnrollmentModel,
  OrderModel,
  SettingsModel,
  UserModel,
} from "../models/index.js";
import { formatArs, newId, nowIso, slugify } from "../lib/utils.js";
import { LIST_HARD_LIMIT } from "../lib/pagination.js";
import type {
  CourseInput,
  StoredContact,
  StoredConversation,
  StoredCourse,
  StoredEnrollment,
  StoredMessage,
  StoredModule,
  StoredOrder,
  StoredSettings,
  StoredUser,
} from "../types.js";
import type {
  ContactRepository,
  ConversationRepository,
  CourseRepository,
  EnrollmentRepository,
  OrderRepository,
  Repositories,
  SettingsRepository,
  UserRepository,
} from "./interfaces.js";

const clean = <T>(doc: unknown): T => {
  const value = { ...(doc as Record<string, unknown>) };
  delete value._id;
  delete value.__v;
  return value as T;
};

export function createMongooseRepositories(): Repositories {
  const users: UserRepository = {
    async findByEmail(email) {
      const doc = await UserModel.findOne({ email: email.toLowerCase() }).lean().exec();
      return doc ? clean<StoredUser>(doc) : null;
    },
    async findById(id) {
      const doc = await UserModel.findOne({ id }).lean().exec();
      return doc ? clean<StoredUser>(doc) : null;
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
        passwordHash: input.passwordHash,
        createdAt: nowIso(),
      });
      return clean<StoredUser>(doc.toObject());
    },
    async update(id, patch) {
      const update = { ...patch };
      if (update.email) update.email = update.email.toLowerCase();
      const doc = await UserModel.findOneAndUpdate({ id }, { $set: update }, { returnDocument: "after" })
        .lean()
        .exec();
      return doc ? clean<StoredUser>(doc) : null;
    },
    async delete(id) {
      const result = await UserModel.deleteOne({ id }).exec();
      return result.deletedCount === 1;
    },
  };

  const courses: CourseRepository = {
    async list() {
      const docs = await CourseModel.find({}).sort({ legacyId: 1 }).lean().exec();
      return docs.map((doc) => clean<StoredCourse>(doc));
    },
    async listPublished() {
      const docs = await CourseModel.find({ status: "published" })
        .sort({ legacyId: 1 })
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredCourse>(doc));
    },
    async findBySlug(slug) {
      const doc = await CourseModel.findOne({ slug }).lean().exec();
      return doc ? clean<StoredCourse>(doc) : null;
    },
    async findById(legacyId) {
      const doc = await CourseModel.findOne({ legacyId }).lean().exec();
      return doc ? clean<StoredCourse>(doc) : null;
    },
    async nextLegacyId() {
      const doc = await CourseModel.findOne({}).sort({ legacyId: -1 }).select("legacyId").lean().exec();
      return (doc?.legacyId ?? 0) + 1;
    },
    async create(input) {
      const legacyId = await this.nextLegacyId();
      const baseSlug = slugify(input.title);
      let slug = baseSlug;
      let suffix = 2;
      while (await CourseModel.exists({ slug })) {
        slug = `${baseSlug}-${suffix++}`;
      }
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
      });
      return clean<StoredCourse>(doc.toObject());
    },
    async update(legacyId, patch) {
      const update: Record<string, unknown> = { ...patch, updatedAt: nowIso() };
      if (patch.priceCents !== undefined) update.price = formatArs(patch.priceCents);
      const doc = await CourseModel.findOneAndUpdate(
        { legacyId },
        { $set: update },
        { returnDocument: "after" },
      )
        .lean()
        .exec();
      return doc ? clean<StoredCourse>(doc) : null;
    },
    async saveModules(legacyId, modules: StoredModule[]) {
      const doc = await CourseModel.findOneAndUpdate(
        { legacyId },
        { $set: { modules, updatedAt: nowIso() } },
        { returnDocument: "after" },
      )
        .lean()
        .exec();
      return doc ? clean<StoredCourse>(doc) : null;
    },
    async delete(legacyId) {
      const result = await CourseModel.deleteOne({ legacyId }).exec();
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

  const orders: OrderRepository = {
    async list() {
      const docs = await OrderModel.find({})
        .sort({ createdAt: -1 })
        .limit(LIST_HARD_LIMIT)
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredOrder>(doc));
    },
    async findByReference(reference) {
      const doc = await OrderModel.findOne({
        $or: [{ externalReference: reference }, { id: reference }],
      })
        .lean()
        .exec();
      return doc ? clean<StoredOrder>(doc) : null;
    },
    async create(input) {
      const doc = await OrderModel.create(input);
      return clean<StoredOrder>(doc.toObject());
    },
    async updateStatus(id, estado: OrderStatus) {
      const doc = await OrderModel.findOneAndUpdate({ id }, { $set: { estado } }, { returnDocument: "after" })
        .lean()
        .exec();
      return doc ? clean<StoredOrder>(doc) : null;
    },
  };

  const conversations: ConversationRepository = {
    async listAll() {
      const docs = await ConversationModel.find({}).limit(LIST_HARD_LIMIT).lean().exec();
      return docs.map((doc) => clean<StoredConversation>(doc));
    },
    async listByTeacher(email) {
      const docs = await ConversationModel.find({ teacherEmail: email.toLowerCase() })
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredConversation>(doc));
    },
    async findById(id) {
      const doc = await ConversationModel.findOne({ id }).lean().exec();
      return doc ? clean<StoredConversation>(doc) : null;
    },
    async findByStudentAndCourse(email, courseId) {
      const doc = await ConversationModel.findOne({
        studentEmail: email.toLowerCase(),
        courseId,
      })
        .lean()
        .exec();
      return doc ? clean<StoredConversation>(doc) : null;
    },
    async create(input) {
      const doc = await ConversationModel.create(input);
      return clean<StoredConversation>(doc.toObject());
    },
    async addMessage(id, message: StoredMessage) {
      const doc = await ConversationModel.findOneAndUpdate(
        { id },
        { $push: { messages: message } },
        { returnDocument: "after" },
      )
        .lean()
        .exec();
      return doc ? clean<StoredConversation>(doc) : null;
    },
  };

  const settings: SettingsRepository = {
    async get() {
      const doc = await SettingsModel.findOne({}).lean().exec();
      if (!doc) throw new Error("La configuración del sitio no existe en Atlas.");
      return clean<StoredSettings>(doc);
    },
    async update(patch) {
      const current = await SettingsModel.findOne({}).lean().exec();
      if (!current) {
        throw new Error("La configuración del sitio no existe en Atlas.");
      }
      const doc = await SettingsModel.findOneAndUpdate(
        {},
        { $set: { ...patch, updatedAt: nowIso() } },
        { returnDocument: "after" },
      )
        .lean()
        .exec();
      return clean<StoredSettings>(doc);
    },
  };

  const contacts: ContactRepository = {
    async list(page) {
      const docs = await ContactModel.find({})
        .sort({ createdAt: -1 })
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

  return {
    mode: "atlas",
    users,
    courses,
    enrollments,
    orders,
    conversations,
    settings,
    contacts,
  };
}
