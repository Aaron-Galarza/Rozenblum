import mongoose, { Schema } from "mongoose";
import type { HomeContentDTO } from "@rozenblum/shared";
import type {
  StoredContact,
  StoredConversation,
  StoredCourse,
  StoredEnrollment,
  StoredOrder,
  StoredSettings,
  StoredUser,
} from "../types.js";

const blockSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    content: { type: String, default: "" },
    items: { type: [String], default: undefined },
    expanded: { type: Boolean, default: undefined },
    toggleContent: { type: String, default: undefined },
  },
  { _id: false, versionKey: false },
);

const lessonSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    type: { type: String, required: true },
    position: { type: Number, required: true },
    highlight: { type: Boolean, default: undefined },
    content: { type: [blockSchema], default: [] },
    document: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false, versionKey: false },
);

const moduleSchema = new Schema(
  {
    id: { type: Number, required: true },
    title: { type: String, required: true },
    position: { type: Number, required: true },
    lessons: { type: [lessonSchema], default: [] },
  },
  { _id: false, versionKey: false },
);

const temarioSchema = new Schema(
  {
    mod: { type: Number, required: true },
    title: { type: String, required: true },
    lessons: { type: [String], default: [] },
  },
  { _id: false, versionKey: false },
);

const userSchema = new Schema<StoredUser>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true },
    role: { type: String, required: true, enum: ["alumno", "profesor", "admin"] },
    status: { type: String, required: true, enum: ["Activo", "Suspendido"], default: "Activo" },
    initials: { type: String, required: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { versionKey: false, collection: "users" },
);

const courseSchema = new Schema<StoredCourse>(
  {
    legacyId: { type: Number, required: true, unique: true, index: true },
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: String, required: true },
    priceCents: { type: Number, required: true },
    duration: { type: String, required: true },
    level: { type: String, required: true },
    img: { type: String, required: true },
    professor: { type: String, required: true },
    professorEmail: { type: String, default: undefined, index: true },
    status: { type: String, required: true, enum: ["published", "draft"], default: "draft" },
    temario: { type: [temarioSchema], default: [] },
    modules: { type: [moduleSchema], default: [] },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false, collection: "courses" },
);

courseSchema.index({ status: 1, legacyId: 1 });

const enrollmentSchema = new Schema<StoredEnrollment>(
  {
    id: { type: String, required: true, unique: true, index: true },
    studentEmail: { type: String, required: true, index: true, lowercase: true },
    studentName: { type: String, required: true },
    courseId: { type: Number, required: true, index: true },
    status: { type: String, required: true, enum: ["Activo", "Pendiente", "Completado", "Revocado"] },
    startedAt: { type: String, required: true },
    completedLessonIds: { type: [String], default: [] },
  },
  { versionKey: false, collection: "enrollments" },
);

enrollmentSchema.index({ studentEmail: 1, courseId: 1 }, { unique: true });

const orderSchema = new Schema<StoredOrder>(
  {
    id: { type: String, required: true, unique: true, index: true },
    externalReference: { type: String, required: true, unique: true, index: true },
    alumno: { type: String, required: true },
    email: { type: String, required: true, index: true, lowercase: true },
    curso: { type: String, required: true },
    courseSlug: { type: String, required: true },
    courseId: { type: Number, required: true },
    monto: { type: String, required: true },
    montoCents: { type: Number, required: true },
    fecha: { type: String, required: true },
    metodo: { type: String, required: true },
    estado: {
      type: String,
      required: true,
      enum: ["Pagado", "Pendiente", "Rechazado", "Reembolsado"],
    },
    createdAt: { type: String, required: true },
  },
  { versionKey: false, collection: "orders" },
);

orderSchema.index({ estado: 1, createdAt: -1 });

const messageSchema = new Schema(
  {
    id: { type: String, required: true },
    from: { type: String, required: true, enum: ["me", "prof"] },
    text: { type: String, required: true },
    time: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { _id: false, versionKey: false },
);

const conversationSchema = new Schema<StoredConversation>(
  {
    id: { type: String, required: true, unique: true, index: true },
    courseId: { type: Number, required: true, index: true },
    studentEmail: { type: String, required: true, index: true, lowercase: true },
    studentName: { type: String, required: true },
    teacherEmail: { type: String, required: true, index: true, lowercase: true },
    teacherName: { type: String, required: true },
    messages: { type: [messageSchema], default: [] },
  },
  { versionKey: false, collection: "conversations" },
);

conversationSchema.index({ studentEmail: 1, courseId: 1 });

const settingsSchema = new Schema<StoredSettings>(
  {
    companyName: { type: String, required: true },
    supportEmail: { type: String, required: true },
    contactWhatsapp: { type: String, required: true },
    logoUrl: { type: String, default: "" },
    privacyText: { type: String, default: "" },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false, collection: "settings" },
);

const contactSchema = new Schema<StoredContact>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { versionKey: false, collection: "contacts" },
);

contactSchema.index({ createdAt: -1 });

export const UserModel =
  (mongoose.models.User as mongoose.Model<StoredUser>) ??
  mongoose.model<StoredUser>("User", userSchema);

export const CourseModel =
  (mongoose.models.Course as mongoose.Model<StoredCourse>) ??
  mongoose.model<StoredCourse>("Course", courseSchema);

export const EnrollmentModel =
  (mongoose.models.Enrollment as mongoose.Model<StoredEnrollment>) ??
  mongoose.model<StoredEnrollment>("Enrollment", enrollmentSchema);

export const OrderModel =
  (mongoose.models.Order as mongoose.Model<StoredOrder>) ??
  mongoose.model<StoredOrder>("Order", orderSchema);

export const ConversationModel =
  (mongoose.models.Conversation as mongoose.Model<StoredConversation>) ??
  mongoose.model<StoredConversation>("Conversation", conversationSchema);

export const SettingsModel =
  (mongoose.models.Settings as mongoose.Model<StoredSettings>) ??
  mongoose.model<StoredSettings>("Settings", settingsSchema);

export const ContactModel =
  (mongoose.models.Contact as mongoose.Model<StoredContact>) ??
  mongoose.model<StoredContact>("Contact", contactSchema);

const homeContentSchema = new Schema<HomeContentDTO>(
  {
    key: { type: String, required: true, unique: true },
    brand: {
      locationLabel: String,
      foundedYear: String,
      heroImage: String,
      metrics: [{ value: String, label: String }],
      aboutParagraphs: [String],
      footerTagline: String,
    },
    team: [{ name: String, role: String, img: String }],
    practiceAreas: [{
      title: String,
      desc: String,
      icon: String,
      casos: [{ q: String, a: String }],
    }],
  },
  { versionKey: false, collection: "site_content" },
);

export const HomeContentModel =
  (mongoose.models.HomeContent as mongoose.Model<HomeContentDTO>) ??
  mongoose.model<HomeContentDTO>("HomeContent", homeContentSchema);
