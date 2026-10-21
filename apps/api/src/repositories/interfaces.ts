import type { OrderStatus, Role } from "@rozenblum/shared";
import type { Pagination } from "../lib/pagination.js";
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

export type AppMode = "mock" | "atlas";

export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  list(role?: Role, page?: Pagination): Promise<StoredUser[]>;
  create(input: {
    name: string;
    email: string;
    role: Role;
    status?: "Activo" | "Suspendido";
    passwordHash: string;
    initials: string;
  }): Promise<StoredUser>;
  update(
    id: string,
    patch: Partial<Pick<StoredUser, "name" | "email" | "status" | "passwordHash" | "initials">>,
  ): Promise<StoredUser | null>;
  delete(id: string): Promise<boolean>;
}

export interface CourseRepository {
  list(): Promise<StoredCourse[]>;
  listPublished(): Promise<StoredCourse[]>;
  findBySlug(slug: string): Promise<StoredCourse | null>;
  findById(legacyId: number): Promise<StoredCourse | null>;
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
      >
    >,
  ): Promise<StoredCourse | null>;
  saveModules(legacyId: number, modules: StoredModule[]): Promise<StoredCourse | null>;
  delete(legacyId: number): Promise<boolean>;
}

export interface EnrollmentRepository {
  listAll(page?: Pagination): Promise<StoredEnrollment[]>;
  listByStudent(email: string): Promise<StoredEnrollment[]>;
  findById(id: string): Promise<StoredEnrollment | null>;
  findByStudentAndCourse(email: string, courseId: number): Promise<StoredEnrollment | null>;
  create(input: {
    studentEmail: string;
    studentName: string;
    courseId: number;
    status: StoredEnrollment["status"];
    completedLessonIds?: string[];
  }): Promise<StoredEnrollment>;
  setCompletedLessons(id: string, lessonIds: string[]): Promise<StoredEnrollment | null>;
  updateStatus(id: string, status: StoredEnrollment["status"]): Promise<StoredEnrollment | null>;
  deleteByStudent(email: string): Promise<number>;
}

export interface OrderRepository {
  list(): Promise<StoredOrder[]>;
  findByReference(reference: string): Promise<StoredOrder | null>;
  create(input: StoredOrder): Promise<StoredOrder>;
  updateStatus(id: string, estado: OrderStatus): Promise<StoredOrder | null>;
}

export interface ConversationRepository {
  listAll(): Promise<StoredConversation[]>;
  listByTeacher(email: string): Promise<StoredConversation[]>;
  findById(id: string): Promise<StoredConversation | null>;
  findByStudentAndCourse(
    email: string,
    courseId: number,
  ): Promise<StoredConversation | null>;
  create(input: StoredConversation): Promise<StoredConversation>;
  addMessage(id: string, message: StoredMessage): Promise<StoredConversation | null>;
}

export interface SettingsRepository {
  get(): Promise<StoredSettings>;
  update(patch: Partial<StoredSettings>): Promise<StoredSettings>;
}

export interface ContactRepository {
  list(page?: Pagination): Promise<StoredContact[]>;
  create(input: StoredContact): Promise<StoredContact>;
}

export type Repositories = {
  mode: AppMode;
  users: UserRepository;
  courses: CourseRepository;
  enrollments: EnrollmentRepository;
  orders: OrderRepository;
  conversations: ConversationRepository;
  settings: SettingsRepository;
  contacts: ContactRepository;
};
