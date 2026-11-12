import mongoose, { Schema } from "mongoose";
import type { HomeContentDTO } from "@rozenblum/shared";
import type {
  StoredAdminEvent,
  StoredContact,
  StoredConversation,
  StoredCourse,
  StoredEnrollment,
  StoredOrder,
  StoredPaymentEvent,
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
    requestId: { type: String, default: undefined },
    createdBy: { type: String, default: undefined },
    createdAt: { type: String, default: undefined },
    updatedBy: { type: String, default: undefined },
    updatedAt: { type: String, default: undefined },
  },
  { _id: false, versionKey: false, minimize: false },
);

const moduleSchema = new Schema(
  {
    id: { type: Number, required: true },
    title: { type: String, required: true },
    position: { type: Number, required: true },
    lessons: { type: [lessonSchema], default: [] },
    requestId: { type: String, default: undefined },
    createdBy: { type: String, default: undefined },
    createdAt: { type: String, default: undefined },
    updatedBy: { type: String, default: undefined },
    updatedAt: { type: String, default: undefined },
  },
  { _id: false, versionKey: false, minimize: false },
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
    sessionVersion: { type: Number, required: true, default: 0 },
    img: { type: String, default: undefined },
    createdAt: { type: String, required: true },
    deletedAt: { type: String, default: undefined },
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
    img: { type: String, default: "" },
    professor: { type: String, required: true },
    professorEmail: { type: String, required: true, index: true, lowercase: true },
    status: { type: String, required: true, enum: ["published", "draft"], default: "draft" },
    temario: { type: [temarioSchema], default: [] },
    modules: { type: [moduleSchema], default: [] },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    revision: { type: Number, required: true, default: 0 },
    everPublished: { type: Boolean, required: true, default: false },
    nextLessonNumber: { type: Number, required: true, default: 0 },
    requestId: { type: String, default: undefined },
    accessDays: { type: Number, default: undefined, min: 0 },
    expiresOn: { type: String, default: undefined },
  },
  { versionKey: false, collection: "courses", minimize: false },
);

courseSchema.index({ status: 1, legacyId: 1 });
courseSchema.index({ status: 1, createdAt: -1, legacyId: -1 });
courseSchema.index({ expiresOn: 1 });
courseSchema.index({ requestId: 1 }, {
  unique: true,
  partialFilterExpression: { requestId: { $type: "string" } },
});

const enrollmentSchema = new Schema<StoredEnrollment>(
  {
    id: { type: String, required: true, unique: true, index: true },
    studentEmail: { type: String, required: true, index: true, lowercase: true },
    studentName: { type: String, required: true },
    courseId: { type: Number, required: true, index: true },
    status: { type: String, required: true, enum: ["Activo", "Pendiente", "Completado", "Revocado"] },
    startedAt: { type: String, required: true },
    completedLessonIds: { type: [String], default: [] },
    expiresAt: { type: String, default: undefined },
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
    dniPasswordHash: { type: String, default: undefined, select: false },
    curso: { type: String, required: true },
    courseSlug: { type: String, required: true },
    courseId: { type: Number, required: true, index: true },
    monto: { type: String, required: true },
    montoCents: { type: Number, required: true },
    fecha: { type: String, required: true },
    metodo: { type: String, required: true },
    estado: {
      type: String,
      required: true,
      enum: ["Pagado", "Pendiente", "Rechazado", "En disputa", "Reembolsado"],
    },
    createdAt: { type: String, required: true },
    paymentProvider: { type: String, enum: ["mercadopago", "manual"], default: "manual" },
    preferenceId: { type: String, default: undefined, index: true },
    paymentUrl: { type: String, default: undefined },
    paymentId: { type: String, default: undefined },
  },
  { versionKey: false, collection: "orders" },
);

orderSchema.index({ estado: 1, createdAt: -1 });
orderSchema.index({ paymentId: 1 }, { unique: true,
  partialFilterExpression: { paymentId: { $type: "string" } } });

const paymentEventSchema = new Schema<StoredPaymentEvent>({
  id: { type: String, required: true, unique: true, index: true },
  orderId: { type: String, required: true, index: true },
  source: { type: String, required: true, enum: ["mercadopago", "manual"] },
  providerEventId: { type: String, default: undefined },
  providerPaymentId: { type: String, default: undefined },
  previousStatus: { type: String, required: true },
  nextStatus: { type: String, required: true },
  actorId: { type: String, default: undefined },
  reason: { type: String, required: true },
  createdAt: { type: String, required: true },
  paymentStatus: { type: String, default: undefined },
}, { versionKey: false, collection: "payment_events" });
paymentEventSchema.index({ source: 1, providerEventId: 1 }, {
  unique: true, partialFilterExpression: { providerEventId: { $type: "string" } },
});
paymentEventSchema.index({ orderId: 1, nextStatus: 1, createdAt: 1 });

const messageSchema = new Schema(
  {
    id: { type: String, required: true },
    /** Legacy perspective flag; new messages use the authorship fields below. */
    from: { type: String, enum: ["me", "prof"], default: undefined },
    authorEmail: { type: String, default: undefined, lowercase: true },
    authorRole: { type: String, enum: ["alumno", "profesor", "admin"], default: undefined },
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

conversationSchema.index({ studentEmail: 1, courseId: 1 }, { unique: true });

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

contactSchema.index({ createdAt: -1, id: -1 });

const adminEventSchema = new Schema<StoredAdminEvent>(
  {
    id: { type: String, required: true, unique: true, index: true },
    actorId: { type: String, required: true, index: true },
    actorEmail: { type: String, required: true },
    action: { type: String, required: true, enum: ["create", "update", "delete"] },
    entity: { type: String, required: true, enum: ["user", "course"] },
    entityId: { type: String, required: true, index: true },
    previousState: { type: Schema.Types.Mixed, default: undefined },
    nextState: { type: Schema.Types.Mixed, default: undefined },
    reason: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { versionKey: false, collection: "admin_events" },
);

adminEventSchema.index({ createdAt: -1, id: -1 });
adminEventSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

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

export const PaymentEventModel =
  (mongoose.models.PaymentEvent as mongoose.Model<StoredPaymentEvent>) ??
  mongoose.model<StoredPaymentEvent>("PaymentEvent", paymentEventSchema);

export const ConversationModel =
  (mongoose.models.Conversation as mongoose.Model<StoredConversation>) ??
  mongoose.model<StoredConversation>("Conversation", conversationSchema);

export const ContactModel =
  (mongoose.models.Contact as mongoose.Model<StoredContact>) ??
  mongoose.model<StoredContact>("Contact", contactSchema);

export const AdminEventModel =
  (mongoose.models.AdminEvent as mongoose.Model<StoredAdminEvent>) ??
  mongoose.model<StoredAdminEvent>("AdminEvent", adminEventSchema);

const homeContentSchema = new Schema<HomeContentDTO>(
  {
    key: { type: String, required: true, unique: true },
    brand: {
      locationLabel: String,
      foundedYear: String,
      metrics: [{ value: String, label: String }],
      aboutParagraphs: [String],
      footerTagline: String,
    },
    team: [{ name: String, role: String, img: String, userId: String }],
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
