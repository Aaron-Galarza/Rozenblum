import type { HomeContentDTO, OrderStatus, Role } from "@rozenblum/shared";
import type { Pagination } from "../lib/pagination.js";
import type {
  CourseInput,
  PublicCourseRecord,
  StoredAdminEvent,
  StoredContact,
  StoredConversation,
  StoredCourse,
  StoredCourseArchive,
  StoredEnrollment,
  StoredMessage,
  StoredModule,
  StoredOrder,
  StoredPaymentEvent,
  StoredUser,
} from "../types.js";

export type AppMode = "test" | "atlas";

/** Pre-aggregated enrollment numbers; computed in the database, never truncated. */
export type EnrollmentMetrics = {
  total: number;
  /** Distinct students with at least one active enrollment. */
  activeStudents: number;
  startedLast7Days: number;
  /** `YYYY-MM` keys with the number of enrollments started that month. */
  monthly: { month: string; value: number }[];
  byCourse: { courseId: number; students: number; averageCompletedLessons: number }[];
};

/** Pre-aggregated revenue, limited to confirmed payments. */
export type OrderMetrics = {
  total: number;
  paidCount: number;
  paidCents: number;
  /** `YYYY-MM` keys with confirmed paid cents for that month. */
  paidMonthly: { month: string; cents: number }[];
};

export type UserCounts = Record<Role, number>;
export type CourseStatusCounts = { published: number; draft: number };

export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  findProfessorImagesByIds(ids: string[]): Promise<{ id: string; img?: string }[]>;
  list(role?: Role, page?: Pagination): Promise<StoredUser[]>;
  /** Counts accounts that are still active records, grouped by role. */
  countByRole(): Promise<UserCounts>;
  create(input: {
    name: string;
    email: string;
    role: Role;
    status?: "Activo" | "Suspendido";
    passwordHash: string;
    initials: string;
    img?: string;
    sessionVersion?: number;
  }): Promise<StoredUser>;
  update(
    id: string,
    patch: Partial<
      Pick<
        StoredUser,
        "name" | "email" | "status" | "passwordHash" | "initials" | "img" | "deletedAt"
      >
    >,
    options?: { revokeSessions?: boolean },
  ): Promise<StoredUser | null>;
  delete(id: string): Promise<boolean>;
}

export interface CourseRepository {
  list(): Promise<StoredCourse[]>;
  countByStatus(): Promise<CourseStatusCounts>;
  listPublished(): Promise<PublicCourseRecord[]>;
  findLatestPublished(): Promise<StoredCourse | null>;
  findBySlug(slug: string): Promise<StoredCourse | null>;
  findById(legacyId: number): Promise<StoredCourse | null>;
  /** Writes the course inside checkout's transaction to conflict with expiry removal. */
  claimForCheckout(legacyId: number): Promise<boolean>;
  findByRequestId(requestId: string): Promise<StoredCourse | null>;
  nextLegacyId(): Promise<number>;
  create(input: CourseInput): Promise<StoredCourse>;
  update(
    legacyId: number,
    patch: Partial<
      Pick<
        StoredCourse,
        | "title"
        | "description"
        | "price"
        | "priceCents"
        | "duration"
        | "level"
        | "img"
        | "professor"
        | "professorEmail"
        | "status"
        | "temario"
        | "everPublished"
        | "accessDays"
        | "expiresOn"
      >
    >,
    expectedRevision: number,
  ): Promise<StoredCourse | null>;
  saveModules(
    legacyId: number,
    modules: StoredModule[],
    expectedRevision: number,
    nextLessonNumber?: number,
  ): Promise<StoredCourse | null>;
  delete(legacyId: number, expectedRevision: number): Promise<boolean>;
  /** Deletes only a course whose expiry is still due at the write. */
  deleteExpired(legacyId: number, expiresOn: string, expectedRevision: number): Promise<boolean>;
  listExpiredIds(afterId?: number, limit?: number): Promise<number[]>;
}

export interface CourseArchiveRepository {
  findByCourseId(courseId: number): Promise<StoredCourseArchive | null>;
  list(page?: Pagination): Promise<StoredCourseArchive[]>;
  count(): Promise<number>;
  create(archive: StoredCourseArchive): Promise<void>;
}

export type EnrollmentArchiveSummary = {
  enrollmentCount: number;
  completedCount: number;
  averageCompletedLessons: number;
  startedByDay: { day: string; count: number }[];
};

export interface EnrollmentRepository {
  listAll(page?: Pagination): Promise<StoredEnrollment[]>;
  listVisibleForAdmin(page?: Pagination): Promise<StoredEnrollment[]>;
  countVisibleForAdmin(): Promise<number>;
  /** Streams all visible records for an administrator export. */
  iterateVisibleForAdmin(): AsyncIterable<StoredEnrollment>;
  /** Enrollments of the given students, used to describe a paginated admin page. */
  listByStudents(emails: string[]): Promise<StoredEnrollment[]>;
  /** Aggregated totals that stay accurate beyond the list page size. */
  metrics(): Promise<EnrollmentMetrics>;
  existsByCourse(courseId: number): Promise<boolean>;
  archiveSummary(courseId: number): Promise<EnrollmentArchiveSummary>;
  deleteByCourse(courseId: number): Promise<number>;
  listByStudent(email: string): Promise<StoredEnrollment[]>;
  /** All non-pending enrollments for the teacher's courses, without the generic list cap. */
  listByCourseIds(courseIds: number[]): Promise<StoredEnrollment[]>;
  findById(id: string): Promise<StoredEnrollment | null>;
  findByStudentAndCourse(email: string, courseId: number): Promise<StoredEnrollment | null>;
  create(input: {
    studentEmail: string;
    studentName: string;
    courseId: number;
    status: StoredEnrollment["status"];
    completedLessonIds?: string[];
    expiresAt?: string;
  }): Promise<StoredEnrollment>;
  /** Atomically adds or removes one lesson, so retries never duplicate history. */
  updateCompletedLesson(
    id: string,
    lessonId: string,
    completed: boolean,
  ): Promise<StoredEnrollment | null>;
  updateStatus(id: string, status: StoredEnrollment["status"]): Promise<StoredEnrollment | null>;
  setExpiresAt(id: string, expiresAt?: string): Promise<StoredEnrollment | null>;
}

export interface OrderRepository {
  list(page?: Pagination): Promise<StoredOrder[]>;
  listVisibleForAdmin(page?: Pagination): Promise<StoredOrder[]>;
  countVisibleForAdmin(): Promise<number>;
  /** Streams all visible records for an administrator export. */
  iterateVisibleForAdmin(): AsyncIterable<StoredOrder>;
  /** Revenue and monthly totals for confirmed payments only. */
  metrics(): Promise<OrderMetrics>;
  existsByCourse(courseId: number): Promise<boolean>;
  hasUnsettledPaymentByCourse(courseId: number): Promise<boolean>;
  findByReference(reference: string): Promise<StoredOrder | null>;
  findLatestByStudentAndCourse(email: string, courseId: number): Promise<StoredOrder | null>;
  create(input: StoredOrder): Promise<StoredOrder>;
  updateStatus(id: string, estado: OrderStatus, paymentId?: string): Promise<StoredOrder | null>;
}

export interface PaymentEventRepository {
  findByProviderEventId(providerEventId: string): Promise<StoredPaymentEvent | null>;
  listByOrder(orderId: string): Promise<StoredPaymentEvent[]>;
  create(event: StoredPaymentEvent): Promise<StoredPaymentEvent>;
}

export interface ConversationRepository {
  listByTeacher(email: string): Promise<StoredConversation[]>;
  findById(id: string): Promise<StoredConversation | null>;
  findByStudentAndCourse(
    email: string,
    courseId: number,
  ): Promise<StoredConversation | null>;
  create(input: StoredConversation): Promise<StoredConversation>;
  /** Appends atomically without loading the entire embedded history. */
  addMessage(id: string, message: StoredMessage): Promise<"added" | "limit" | "missing">;
  /** Reads one page of the embedded history, newest pages first. */
  listMessages(
    id: string,
    page?: Pagination,
  ): Promise<{ messages: StoredMessage[]; total: number } | null>;
  /** Moves every thread of a course to its new professor. */
  reassignTeacher(courseId: number, teacherEmail: string, teacherName: string): Promise<number>;
  /** Removes threads when their course is deleted. */
  deleteByCourse(courseId: number): Promise<number>;
  archiveSummary(courseId: number): Promise<{ conversationCount: number; messageCount: number }>;
}

export interface ContactRepository {
  list(page?: Pagination): Promise<StoredContact[]>;
  count(): Promise<number>;
  create(input: StoredContact): Promise<StoredContact>;
}

export interface AdminEventRepository {
  create(event: StoredAdminEvent): Promise<StoredAdminEvent>;
  list(page?: Pagination, entity?: "user" | "course"): Promise<StoredAdminEvent[]>;
  count(entity?: "user" | "course"): Promise<number>;
}

export interface HomeRepository {
  get(): Promise<HomeContentDTO | null>;
}

export type Repositories = {
  mode: AppMode;
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
  users: UserRepository;
  courses: CourseRepository;
  courseArchives: CourseArchiveRepository;
  enrollments: EnrollmentRepository;
  orders: OrderRepository;
  paymentEvents: PaymentEventRepository;
  conversations: ConversationRepository;
  contacts: ContactRepository;
  adminEvents: AdminEventRepository;
  home: HomeRepository;
};
