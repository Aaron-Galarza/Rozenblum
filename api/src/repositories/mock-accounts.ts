import type { Role } from "@rozenblum/shared";
import { newId, nowIso } from "../lib/utils.js";
import type { StoredEnrollment, StoredUser } from "../types.js";
import type {
  EnrollmentMetrics,
  EnrollmentRepository,
  UserCounts,
  UserRepository,
} from "./interfaces.js";
import { clone, type Memory } from "./mock-memory.js";

export function createMockAccountsRepositories(db: Memory) {
  const users: UserRepository = {
    async findByEmail(email) {
      return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async findById(id) {
      return db.users.find((u) => u.id === id) ?? null;
    },
    async findProfessorImagesByIds(ids) {
      const wanted = new Set(ids);
      return db.users
        .filter((user) => user.role === "profesor" && wanted.has(user.id))
        .map(({ id, img }) => ({ id, img }));
    },
    async list(role: Role | undefined, page) {
      const users = db.users.filter(
        (user) => !user.deletedAt && (!role || user.role === role),
      );
      return page ? users.slice(page.offset, page.offset + page.limit) : users;
    },
    async countByRole() {
      const counts: UserCounts = { alumno: 0, profesor: 0, admin: 0 };
      for (const user of db.users) {
        if (!user.deletedAt) counts[user.role] += 1;
      }
      return counts;
    },
    async create(input) {
      const user: StoredUser = {
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
      };
      db.users.push(user);
      return user;
    },
    async update(id, patch, options) {
      const user = db.users.find((u) => u.id === id);
      if (!user) return null;
      Object.assign(user, patch);
      if (patch.email) user.email = patch.email.toLowerCase();
      if (options?.revokeSessions) user.sessionVersion = (user.sessionVersion ?? 0) + 1;
      return user;
    },
    async delete(id) {
      const index = db.users.findIndex((u) => u.id === id);
      if (index === -1) return false;
      db.users.splice(index, 1);
      return true;
    },
  };
  const enrollments: EnrollmentRepository = {
    async listAll(page) {
      const items = db.enrollments.map(clone);
      return page ? items.slice(page.offset, page.offset + page.limit) : items;
    },
    async listVisibleForAdmin(page) {
      const items = db.enrollments.filter((item) => item.status !== "Pendiente").map(clone);
      return page ? items.slice(page.offset, page.offset + page.limit) : items;
    },
    async countVisibleForAdmin() {
      return db.enrollments.filter((item) => item.status !== "Pendiente").length;
    },
    async *iterateVisibleForAdmin() {
      const rows = db.enrollments.filter((item) => item.status !== "Pendiente")
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
      for (const row of rows) yield clone(row);
    },
    async listByStudents(emails) {
      const wanted = new Set(emails.map((email) => email.toLowerCase()));
      return db.enrollments
        .filter((enrollment) => wanted.has(enrollment.studentEmail.toLowerCase()))
        .map(clone);
    },
    async metrics() {
      const sevenDaysAgo = Date.now() - 7 * 86_400_000;
      const visibleEnrollments = db.enrollments.filter((item) => item.status !== "Pendiente");
      const byCourse = new Map<number, { students: number; completed: number }>();
      const monthly = new Map<string, number>();

      for (const enrollment of visibleEnrollments) {
        const month = enrollment.startedAt.slice(0, 7);
        monthly.set(month, (monthly.get(month) ?? 0) + 1);
        const current = byCourse.get(enrollment.courseId) ?? { students: 0, completed: 0 };
        current.students += 1;
        current.completed += enrollment.completedLessonIds.length;
        byCourse.set(enrollment.courseId, current);
      }

      const metrics: EnrollmentMetrics = {
        total: visibleEnrollments.length,
        activeStudents: new Set(
          db.enrollments
            .filter((enrollment) => enrollment.status === "Activo")
            .map((enrollment) => enrollment.studentEmail.toLowerCase()),
        ).size,
        startedLast7Days: visibleEnrollments.filter(
          (enrollment) => new Date(enrollment.startedAt).getTime() >= sevenDaysAgo,
        ).length,
        monthly: [...monthly.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, value]) => ({ month, value })),
        byCourse: [...byCourse.entries()].map(([courseId, value]) => ({
          courseId,
          students: value.students,
          averageCompletedLessons: value.students === 0 ? 0 : value.completed / value.students,
        })),
      };
      return metrics;
    },
    async existsByCourse(courseId) {
      return db.enrollments.some((item) => item.courseId === courseId);
    },
    async archiveSummary(courseId) {
      const enrolled = db.enrollments.filter((item) => item.courseId === courseId && item.status !== "Pendiente");
      const days = new Map<string, number>();
      for (const item of enrolled) {
        const day = item.startedAt.slice(0, 10);
        days.set(day, (days.get(day) ?? 0) + 1);
      }
      return {
        enrollmentCount: enrolled.length,
        completedCount: enrolled.filter((item) => item.status === "Completado").length,
        averageCompletedLessons: enrolled.length
          ? enrolled.reduce((total, item) => total + item.completedLessonIds.length, 0) / enrolled.length : 0,
        startedByDay: [...days].sort(([a], [b]) => a.localeCompare(b))
          .map(([day, count]) => ({ day, count })),
      };
    },
    async deleteByCourse(courseId) {
      const previous = db.enrollments.length;
      db.enrollments = db.enrollments.filter((item) => item.courseId !== courseId);
      return previous - db.enrollments.length;
    },
    async listByStudent(email) {
      return db.enrollments
        .filter((e) => e.studentEmail.toLowerCase() === email.toLowerCase())
        .map(clone);
    },
    async listByCourseIds(courseIds) {
      const wanted = new Set(courseIds);
      return db.enrollments.filter((item) =>
        wanted.has(item.courseId) && item.status !== "Pendiente").map(clone);
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
      if (db.enrollments.some((item) =>
        item.studentEmail === input.studentEmail.toLowerCase() && item.courseId === input.courseId)) {
        throw Object.assign(new Error("Inscripción duplicada."), { code: 11000 });
      }
      const enrollment: StoredEnrollment = {
        id: newId("enr"),
        studentEmail: input.studentEmail.toLowerCase(),
        studentName: input.studentName,
        courseId: input.courseId,
        status: input.status,
        startedAt: nowIso(),
        completedLessonIds: input.completedLessonIds ?? [],
        expiresAt: input.expiresAt,
      };
      db.enrollments.push(enrollment);
      return clone(enrollment);
    },
    async updateCompletedLesson(id, lessonId, completed) {
      const enrollment = db.enrollments.find((e) => e.id === id);
      if (!enrollment) return null;
      if (completed) {
        if (!enrollment.completedLessonIds.includes(lessonId)) {
          enrollment.completedLessonIds.push(lessonId);
        }
      } else {
        enrollment.completedLessonIds = enrollment.completedLessonIds.filter(
          (item) => item !== lessonId,
        );
      }
      return clone(enrollment);
    },
    async updateStatus(id, status) {
      const enrollment = db.enrollments.find((e) => e.id === id);
      if (!enrollment) return null;
      enrollment.status = status;
      return clone(enrollment);
    },
    async setExpiresAt(id, expiresAt) {
      const enrollment = db.enrollments.find((e) => e.id === id);
      if (!enrollment) return null;
      if (expiresAt) enrollment.expiresAt = expiresAt;
      else delete enrollment.expiresAt;
      return clone(enrollment);
    },
  };
  return { users, enrollments };
}
