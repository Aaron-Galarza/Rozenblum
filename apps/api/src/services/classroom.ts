import type { EnrollmentDTO } from "@rozenblum/shared";
import { badRequest, forbidden, notFound } from "../lib/http.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredUser } from "../types.js";
import {
  computeProgress,
  enrollmentToDTO,
  moduleStatuses,
  totalLessons,
} from "./mappers.js";

export async function loadEnrollment(courseIdOrEnrollmentId: string, user: StoredUser) {
  const repos = getRepositories();
  const isEnrollmentId = courseIdOrEnrollmentId.startsWith("enr_");
  const enrollment = isEnrollmentId
    ? await repos.enrollments.findById(courseIdOrEnrollmentId)
    : await repos.enrollments.findByStudentAndCourse(user.email, Number(courseIdOrEnrollmentId));

  if (!enrollment) throw notFound("Inscripción no encontrada.");
  if (enrollment.studentEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw forbidden("Esta inscripción pertenece a otro alumno.");
  }
  return enrollment;
}

export async function listStudentEnrollments(user: StoredUser): Promise<EnrollmentDTO[]> {
  const repos = getRepositories();
  const enrollments = await repos.enrollments.listByStudent(user.email);
  const courses = await repos.courses.list();
  const byId = new Map(courses.map((course) => [course.legacyId, course]));

  return enrollments
    .map((enrollment) => {
      const course = byId.get(enrollment.courseId);
      return course ? enrollmentToDTO(enrollment, course) : null;
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
  if (enrollment.status === "Pendiente" || enrollment.status === "Revocado") {
    throw forbidden("Tu inscripción no tiene acceso activo.");
  }

  const course = await repos.courses.findById(enrollment.courseId);
  if (!course) throw notFound("Curso no encontrado.");

  const module = course.modules.find((mod) => mod.lessons.some((lesson) => lesson.id === lessonId));
  if (!module) {
    throw badRequest("La lección no pertenece a este curso.");
  }
  if (completed && moduleStatuses(course, enrollment.completedLessonIds).get(module.id) === "locked") {
    throw forbidden("Completá los módulos anteriores para acceder a esta lección.");
  }

  const next = new Set(enrollment.completedLessonIds);
  if (completed) next.add(lessonId);
  else next.delete(lessonId);

  const saved = await repos.enrollments.setCompletedLessons(enrollment.id, [...next]);
  if (!saved) throw notFound("Inscripción no encontrada.");

  const progress = computeProgress(course, saved.completedLessonIds);
  const total = totalLessons(course);
  const status =
    total > 0 && progress >= 100 ? "Completado" : saved.status === "Pendiente" ? "Pendiente" : "Activo";
  const withStatus = await repos.enrollments.updateStatus(saved.id, status);

  return enrollmentToDTO(withStatus ?? saved, course);
}
