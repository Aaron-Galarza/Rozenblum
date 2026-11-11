import type { Role } from "@rozenblum/shared";
import { newId, nowIso } from "../lib/utils.js";
import type { StoredEnrollment, StoredUser } from "../types.js";
import type { UserRepository, EnrollmentRepository } from "./interfaces.js";
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
    async existsByCourse(courseId) {
      return db.enrollments.some((item) => item.courseId === courseId);
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
    async deleteByStudent(email) {
      const before = db.enrollments.length;
      db.enrollments = db.enrollments.filter(
        (e) => e.studentEmail.toLowerCase() !== email.toLowerCase(),
      );
      return before - db.enrollments.length;
    },
  };
  return { users, enrollments };
}
