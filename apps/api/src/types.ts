import type {
  CourseDTO,
  CourseSyllabusModule,
  LessonBlockDTO,
  RichLessonDocument,
  LessonType,
  ModuleStatus,
  OrderStatus,
  Role,
} from "@rozenblum/shared";

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "Activo" | "Suspendido";
  initials: string;
  img?: string;
  passwordHash: string;
  /** Bumped on password/status changes to revoke previously issued tokens. */
  sessionVersion: number;
  createdAt: string;
  /**
   * Set when an administrator removes a student. The account stops working but
   * its enrollments and conversations stay as historical evidence (M-08).
   */
  deletedAt?: string;
};

export type StoredLesson = {
  id: string;
  title: string;
  type: LessonType;
  position: number;
  highlight?: boolean;
  content: LessonBlockDTO[];
  document?: RichLessonDocument;
  /** Idempotency key of the creation request, when one was sent. */
  requestId?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
};

export type StoredModule = {
  id: number;
  title: string;
  position: number;
  lessons: StoredLesson[];
  /** Idempotency key of the creation request, when one was sent. */
  requestId?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
};

export type StoredCourse = {
  legacyId: number;
  slug: string;
  title: string;
  description: string;
  price: string;
  priceCents: number;
  duration: string;
  level: string;
  img: string;
  professor: string;
  professorEmail: string;
  status: "published" | "draft";
  temario: CourseSyllabusModule[];
  modules: StoredModule[];
  createdAt: string;
  updatedAt: string;
  /** Optional for courses created before revision tracking was introduced. */
  revision?: number;
  /** Once published, structural deletion remains forbidden after unpublishing. */
  everPublished?: boolean;
  /** Monotonic suffix for lesson IDs, including IDs of deleted lessons. */
  nextLessonNumber?: number;
  /** Idempotency key of the creation request, when one was sent. */
  requestId?: string;
  /** Days of access granted after payment. 0/undefined means no expiry. */
  accessDays?: number;
};

/** Fields needed by the catalogue, with module IDs but no lesson bodies. */
export type PublicCourseRecord = Pick<
  StoredCourse,
  | "legacyId" | "slug" | "title" | "description" | "price" | "priceCents"
  | "duration" | "level" | "img" | "professor" | "accessDays"
  | "status" | "temario"
> & { modules: { id: number }[] };

export type StoredEnrollment = {
  id: string;
  studentEmail: string;
  studentName: string;
  courseId: number;
  status: "Activo" | "Pendiente" | "Completado" | "Revocado";
  startedAt: string;
  completedLessonIds: string[];
  /** ISO timestamp when the purchased access ends. Absent means no expiry. */
  expiresAt?: string;
};

export type StoredOrder = {
  id: string;
  externalReference: string;
  alumno: string;
  email: string;
  /** Salted scrypt hash of the DNI, carried until payment confirmation. Never expose in DTOs. */
  dniPasswordHash?: string;
  curso: string;
  courseSlug: string;
  courseId: number;
  monto: string;
  montoCents: number;
  fecha: string;
  metodo: string;
  estado: OrderStatus;
  createdAt: string;
  paymentProvider?: "mercadopago" | "manual";
  preferenceId?: string;
  paymentUrl?: string;
  paymentId?: string;
};

export type StoredPaymentEvent = {
  id: string;
  orderId: string;
  source: "mercadopago" | "manual";
  providerEventId?: string;
  providerPaymentId?: string;
  previousStatus: OrderStatus;
  nextStatus: OrderStatus;
  actorId?: string;
  reason: string;
  createdAt: string;
  paymentStatus?: string;
};

export type StoredMessage = {
  id: string;
  /**
   * Legacy perspective flag. Messages written before authorship was stored use
   * it as a fallback; new messages always carry `authorEmail`/`authorRole` and
   * their perspective is derived per reader.
   */
  from?: "me" | "prof";
  authorEmail?: string;
  authorRole?: Role;
  text: string;
  /** Legacy display string, kept for messages written before authorship. */
  time: string;
  createdAt: string;
};

export type StoredConversation = {
  id: string;
  courseId: number;
  studentEmail: string;
  studentName: string;
  teacherEmail: string;
  teacherName: string;
  messages: StoredMessage[];
};

export type StoredContact = {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
};

export type AdminEventAction = "create" | "update" | "delete";
export type AdminEventEntity = "user" | "course";

/** Immutable record of an administrative mutation (who, when, why, before/after). */
export type StoredAdminEvent = {
  id: string;
  actorId: string;
  actorEmail: string;
  action: AdminEventAction;
  entity: AdminEventEntity;
  entityId: string;
  previousState?: Record<string, unknown>;
  nextState?: Record<string, unknown>;
  reason: string;
  createdAt: string;
};

/** Presentation shape sent to the classroom / course editor. */
export type CourseStructure = {
  course: CourseDTO;
  modules: {
    id: number;
    title: string;
    status: ModuleStatus;
    position: number;
    lessons: {
      id: string;
      title: string;
      type: LessonType;
      done: boolean;
      highlight?: boolean;
      position: number;
      content?: LessonBlockDTO[];
    }[];
  }[];
};

export type CourseInput = {
  title: string;
  description: string;
  priceCents: number;
  duration: string;
  level: string;
  professor: string;
  professorEmail: string;
  status: "published" | "draft";
  img: string;
  requestId?: string;
  accessDays?: number;
};
