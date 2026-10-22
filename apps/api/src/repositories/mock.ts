import type { OrderStatus, Role } from "@rozenblum/shared";
import { formatArs, newId, nowIso, slugify } from "../lib/utils.js";
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

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type Memory = {
  users: StoredUser[];
  courses: StoredCourse[];
  enrollments: StoredEnrollment[];
  orders: StoredOrder[];
  conversations: StoredConversation[];
  settings: StoredSettings | null;
  contacts: StoredContact[];
};

function createMemory(initial: Partial<Memory>): Memory {
  return {
    users: [],
    courses: [],
    enrollments: [],
    orders: [],
    conversations: [],
    settings: null,
    contacts: [],
    ...clone(initial),
  };
}

export function createMockRepositories(initial: Partial<Memory> = {}): Repositories {
  const db = createMemory(initial);

  const users: UserRepository = {
    async findByEmail(email) {
      return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async findById(id) {
      return db.users.find((u) => u.id === id) ?? null;
    },
    async list(role: Role | undefined, page) {
      const users = role ? db.users.filter((u) => u.role === role) : [...db.users];
      return page ? users.slice(page.offset, page.offset + page.limit) : users;
    },
    async create(input) {
      const user: StoredUser = {
        id: newId("usr"),
        name: input.name,
        email: input.email.toLowerCase(),
        role: input.role,
        status: input.status ?? "Activo",
        initials: input.initials,
        passwordHash: input.passwordHash,
        createdAt: nowIso(),
      };
      db.users.push(user);
      return user;
    },
    async update(id, patch) {
      const user = db.users.find((u) => u.id === id);
      if (!user) return null;
      Object.assign(user, patch);
      if (patch.email) user.email = patch.email.toLowerCase();
      return user;
    },
    async delete(id) {
      const index = db.users.findIndex((u) => u.id === id);
      if (index === -1) return false;
      db.users.splice(index, 1);
      return true;
    },
  };

  const courses: CourseRepository = {
    async list() {
      return db.courses.map(clone);
    },
    async listPublished() {
      return db.courses.filter((c) => c.status === "published").map(clone);
    },
    async findBySlug(slug) {
      const course = db.courses.find((c) => c.slug === slug);
      return course ? clone(course) : null;
    },
    async findById(legacyId) {
      const course = db.courses.find((c) => c.legacyId === legacyId);
      return course ? clone(course) : null;
    },
    async nextLegacyId() {
      return db.courses.reduce((max, c) => Math.max(max, c.legacyId), 0) + 1;
    },
    async create(input) {
      const legacyId = await this.nextLegacyId();
      const baseSlug = slugify(input.title);
      let slug = baseSlug;
      let suffix = 2;
      while (db.courses.some((c) => c.slug === slug)) {
        slug = `${baseSlug}-${suffix++}`;
      }
      const course: StoredCourse = {
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
      };
      db.courses.push(course);
      return clone(course);
    },
    async update(legacyId, patch) {
      const course = db.courses.find((c) => c.legacyId === legacyId);
      if (!course) return null;
      Object.assign(course, patch);
      if (patch.priceCents !== undefined) course.price = formatArs(patch.priceCents);
      course.updatedAt = nowIso();
      return clone(course);
    },
    async saveModules(legacyId, modules) {
      const course = db.courses.find((c) => c.legacyId === legacyId);
      if (!course) return null;
      course.modules = clone(modules);
      course.updatedAt = nowIso();
      return clone(course);
    },
    async delete(legacyId) {
      const index = db.courses.findIndex((c) => c.legacyId === legacyId);
      if (index === -1) return false;
      db.courses.splice(index, 1);
      return true;
    },
  };

  const enrollments: EnrollmentRepository = {
    async listAll(page) {
      const items = db.enrollments.map(clone);
      return page ? items.slice(page.offset, page.offset + page.limit) : items;
    },
    async listByStudent(email) {
      return db.enrollments
        .filter((e) => e.studentEmail.toLowerCase() === email.toLowerCase())
        .map(clone);
    },
    async findById(id) {
      const enrollment = db.enrollments.find((e) => e.id === id);
      return enrollment ? clone(enrollment) : null;
    },
    async findByStudentAndCourse(email, courseId) {
      const enrollment = db.enrollments.find(
        (e) => e.studentEmail.toLowerCase() === email.toLowerCase() && e.courseId === courseId,
      );
      return enrollment ? clone(enrollment) : null;
    },
    async create(input) {
      const enrollment: StoredEnrollment = {
        id: newId("enr"),
        studentEmail: input.studentEmail.toLowerCase(),
        studentName: input.studentName,
        courseId: input.courseId,
        status: input.status,
        startedAt: nowIso(),
        completedLessonIds: input.completedLessonIds ?? [],
      };
      db.enrollments.push(enrollment);
      return clone(enrollment);
    },
    async setCompletedLessons(id, lessonIds) {
      const enrollment = db.enrollments.find((e) => e.id === id);
      if (!enrollment) return null;
      enrollment.completedLessonIds = [...new Set(lessonIds)];
      return clone(enrollment);
    },
    async updateStatus(id, status) {
      const enrollment = db.enrollments.find((e) => e.id === id);
      if (!enrollment) return null;
      enrollment.status = status;
      return clone(enrollment);
    },
    async deleteByStudent(email) {
      const before = db.enrollments.length;
      db.enrollments = db.enrollments.filter(
        (e) => e.studentEmail.toLowerCase() !== email.toLowerCase(),
      );
      return before - db.enrollments.length;
    },
  };

  const orders: OrderRepository = {
    async list() {
      return [...db.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
    },
    async findByReference(reference) {
      const order = db.orders.find(
        (o) => o.externalReference === reference || o.id === reference,
      );
      return order ? clone(order) : null;
    },
    async create(input) {
      db.orders.push(clone(input));
      return clone(input);
    },
    async updateStatus(id, estado: OrderStatus) {
      const order = db.orders.find((o) => o.id === id);
      if (!order) return null;
      order.estado = estado;
      return clone(order);
    },
  };

  const conversations: ConversationRepository = {
    async listAll() {
      return db.conversations.map(clone);
    },
    async listByTeacher(email) {
      return db.conversations
        .filter((c) => c.teacherEmail.toLowerCase() === email.toLowerCase())
        .map(clone);
    },
    async findById(id) {
      const conversation = db.conversations.find((c) => c.id === id);
      return conversation ? clone(conversation) : null;
    },
    async findByStudentAndCourse(email, courseId) {
      const conversation = db.conversations.find(
        (c) => c.studentEmail.toLowerCase() === email.toLowerCase() && c.courseId === courseId,
      );
      return conversation ? clone(conversation) : null;
    },
    async create(input) {
      db.conversations.push(clone(input));
      return clone(input);
    },
    async addMessage(id, message: StoredMessage) {
      const conversation = db.conversations.find((c) => c.id === id);
      if (!conversation) return null;
      conversation.messages.push(clone(message));
      return clone(conversation);
    },
  };

  const settings: SettingsRepository = {
    async get() {
      if (!db.settings) throw new Error("Falta configuración de prueba.");
      return clone(db.settings);
    },
    async update(patch) {
      if (!db.settings) throw new Error("Falta configuración de prueba.");
      db.settings = { ...db.settings, ...clone(patch), updatedAt: nowIso() };
      return clone(db.settings);
    },
  };

  const contacts: ContactRepository = {
    async list(page) {
      const items = [...db.contacts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
      return page ? items.slice(page.offset, page.offset + page.limit) : items;
    },
    async create(input) {
      db.contacts.push(clone(input));
      return clone(input);
    },
  };

  return {
    mode: "test",
    users,
    courses,
    enrollments,
    orders,
    conversations,
    settings,
    contacts,
  };
}
