import type { HomeContentDTO, OrderStatus, Role } from "@rozenblum/shared";
import type { Pagination } from "../lib/pagination.js";
import type {
  CourseInput,
  PublicCourseRecord,
  StoredContact,
  StoredConversation,
  StoredCourse,
  StoredEnrollment,
  StoredMessage,
  StoredModule,
  StoredOrder,
  StoredPaymentEvent,
  StoredUser,
} from "../types.js";

export type AppMode = "test" | "atlas";

export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  findProfessorImagesByIds(ids: string[]): Promise<{ id: string; img?: string }[]>;
  list(role?: Role, page?: Pagination): Promise<StoredUser[]>;
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
        "name" | "email" | "status" | "passwordHash" | "initials" | "img"
      >
    >,
    options?: { revokeSessions?: boolean },
  ): Promise<StoredUser | null>;
  delete(id: string): Promise<boolean>;
}

export interface CourseRepository {
  list(): Promise<StoredCourse[]>;
  listPublished(): Promise<PublicCourseRecord[]>;
  findLatestPublished(): Promise<StoredCourse | null>;
  findBySlug(slug: string): Promise<StoredCourse | null>;
  findById(legacyId: number): Promise<StoredCourse | null>;
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
}

export interface EnrollmentRepository {
  listAll(page?: Pagination): Promise<StoredEnrollment[]>;
  existsByCourse(courseId: number): Promise<boolean>;
  listByStudent(email: string): Promise<StoredEnrollment[]>;
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
  deleteByStudent(email: string): Promise<number>;
}

export interface OrderRepository {
  list(): Promise<StoredOrder[]>;
  existsByCourse(courseId: number): Promise<boolean>;
  findByReference(reference: string): Promise<StoredOrder | null>;
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
  addMessage(id: string, message: StoredMessage): Promise<StoredConversation | null>;
  /** Moves every thread of a course to its new professor. */
  reassignTeacher(courseId: number, teacherEmail: string, teacherName: string): Promise<number>;
  /** Removes the threads of a deleted student, including their messages. */
  deleteByStudent(email: string): Promise<number>;
}

export interface ContactRepository {
  list(page?: Pagination): Promise<StoredContact[]>;
  create(input: StoredContact): Promise<StoredContact>;
}

export interface HomeRepository {
  get(): Promise<HomeContentDTO | null>;
}

export type Repositories = {
  mode: AppMode;
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
  users: UserRepository;
  courses: CourseRepository;
  enrollments: EnrollmentRepository;
  orders: OrderRepository;
  paymentEvents: PaymentEventRepository;
  conversations: ConversationRepository;
  contacts: ContactRepository;
  home: HomeRepository;
};
