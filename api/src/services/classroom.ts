import type { EnrollmentDTO } from "@rozenblum/shared";
import { badRequest, forbidden, notFound } from "../lib/http.js";
import { isCourseExpired } from "../lib/course-expiry.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredEnrollment, StoredUser } from "../types.js";
import {
  computeProgress,
  courseIndex,
  enrollmentToDTO,
  hasEnrollmentAccess,
  isEnrollmentExpired,
  moduleStatuses,
  totalLessons,
} from "./mappers.js";

/**
 * Rejects pending, revoked and expired enrollments. Callers pass the wording
 * that fits their flow so the same rule is not reimplemented in each service.
 */
export function assertEnrollmentAccess(
  enrollment: Pick<StoredEnrollment, "status" | "expiresAt">,
  messages: { expired: string; denied: string },
): void {
  if (!hasEnrollmentAccess(enrollment)) {
    throw forbidden(isEnrollmentExpired(enrollment) ? messages.expired : messages.denied);
  }
}

export async function loadEnrollment(courseIdOrEnrollmentId: string, user: StoredUser) {
  const repos = getRepositories();
  const isEnrollmentId = courseIdOrEnrollmentId.startsWith("enr_");
  const enrollment = isEnrollmentId
    ? await repos.enrollments.findById(courseIdOrEnrollmentId)
    : await repos.enrollments.findByStudentAndCourse(user.email, Number(courseIdOrEnrollmentId));

  if (!enrollment) {
    if (isEnrollmentId) throw notFound("Inscripción no encontrada.");
    throw forbidden("No tenés una inscripción a este curso.");
  }
  if (enrollment.studentEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw forbidden("Esta inscripción pertenece a otro alumno.");
  }
  const course = await repos.courses.findById(enrollment.courseId);
  if (!course || isCourseExpired(course)) {
    throw forbidden("Este curso ya finalizó.");
  }
  return enrollment;
}

export async function listStudentEnrollments(user: StoredUser): Promise<EnrollmentDTO[]> {
  const repos = getRepositories();
  const enrollments = await repos.enrollments.listByStudent(user.email);
  const courses = await repos.courses.list();
  const byId = courseIndex(courses);

  return enrollments
    .map((enrollment) => {
      const course = byId.get(enrollment.courseId);
      return course && !isCourseExpired(course) ? enrollmentToDTO(enrollment, course) : null;
    })
    .filter((value): value is EnrollmentDTO => Boolean(value));
}

export async function getStudentEnrollment(
  user: StoredUser,
  courseSlugOrId: string,
): Promise<EnrollmentDTO> {
  const repos = getRepositories();
  const course = courseSlugOrId.startsWith("enr_")
    ? null
    : Number.isFinite(Number(courseSlugOrId))
      ? await repos.courses.findById(Number(courseSlugOrId))
      : await repos.courses.findBySlug(courseSlugOrId);

  if (courseSlugOrId.startsWith("enr_")) {
    const enrollment = await loadEnrollment(courseSlugOrId, user);
    const enrollmentCourse = await repos.courses.findById(enrollment.courseId);
    if (!enrollmentCourse) throw notFound("Curso no encontrado.");
    return enrollmentToDTO(enrollment, enrollmentCourse);
  }

  if (!course) throw notFound("Curso no encontrado.");
  const enrollment = await loadEnrollment(String(course.legacyId), user);
  return enrollmentToDTO(enrollment, course);
}

export async function setLessonProgress(
  user: StoredUser,
  enrollmentId: string,
  lessonId: string,
  completed: boolean,
): Promise<EnrollmentDTO> {
  const repos = getRepositories();
  const enrollment = await loadEnrollment(enrollmentId, user);
  assertEnrollmentAccess(enrollment, {
    expired: "Tu acceso a este curso venció.",
    denied: "Tu inscripción no tiene acceso activo.",
  });

  const course = await repos.courses.findById(enrollment.courseId);
  if (!course) throw notFound("Curso no encontrado.");

  const module = course.modules.find((mod) => mod.lessons.some((lesson) => lesson.id === lessonId));
  if (!module) {
    throw badRequest("La lección no pertenece a este curso.");
  }
  if (completed && moduleStatuses(course, enrollment.completedLessonIds).get(module.id) === "locked") {
    throw forbidden("Completá los módulos anteriores para acceder a esta lección.");
  }

  const saved = await repos.enrollments.updateCompletedLesson(enrollment.id, lessonId, completed);
  if (!saved) throw notFound("Inscripción no encontrada.");

  const progress = computeProgress(course, saved.completedLessonIds);
  const total = totalLessons(course);
  const status =
    total > 0 && progress >= 100 ? "Completado" : saved.status === "Pendiente" ? "Pendiente" : "Activo";
  const withStatus = await repos.enrollments.updateStatus(saved.id, status);

  return enrollmentToDTO(withStatus ?? saved, course);
}
