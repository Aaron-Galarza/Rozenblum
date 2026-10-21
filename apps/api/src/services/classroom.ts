import type {
  ChatMessageDTO,
  ConversationDTO,
  EnrollmentDTO,
} from "@rozenblum/shared";
import { badRequest, forbidden, notFound } from "../lib/http.js";
import { newId, nowIso } from "../lib/utils.js";
import { getRepositories } from "../repositories/index.js";
import type {
  StoredConversation,
  StoredCourse,
  StoredEnrollment,
  StoredMessage,
  StoredUser,
} from "../types.js";
import {
  computeProgress,
  conversationToMessages,
  enrollmentToDTO,
  totalLessons,
} from "./mappers.js";

const clock = () =>
  new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(),
  );

async function loadEnrollment(courseIdOrEnrollmentId: string, user: StoredUser) {
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
  if (enrollment.status === "Pendiente") {
    throw forbidden("Tu inscripción aún está pendiente de aprobación.");
  }

  const course = await repos.courses.findById(enrollment.courseId);
  if (!course) throw notFound("Curso no encontrado.");

  const lessonIds = new Set(
    course.modules.flatMap((mod) => mod.lessons.map((lesson) => lesson.id)),
  );
  if (!lessonIds.has(lessonId)) {
    throw badRequest("La lección no pertenece a este curso.");
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

async function ensureConversation(
  enrollment: StoredEnrollment,
  course: StoredCourse,
): Promise<StoredConversation> {
  const repos = getRepositories();
  const existing = await repos.conversations.findByStudentAndCourse(
    enrollment.studentEmail,
    course.legacyId,
  );
  if (existing) return existing;

  const teacher = course.professorEmail
    ? await repos.users.findByEmail(course.professorEmail)
    : null;

  return repos.conversations.create({
    id: newId("cnv"),
    courseId: course.legacyId,
    studentEmail: enrollment.studentEmail,
    studentName: enrollment.studentName,
    teacherEmail: teacher?.email ?? course.professorEmail ?? "",
    teacherName: teacher?.name ?? course.professor,
    messages: [],
  });
}

export async function listStudentMessages(
  user: StoredUser,
  enrollmentId: string,
): Promise<ChatMessageDTO[]> {
  const repos = getRepositories();
  const enrollment = await loadEnrollment(enrollmentId, user);
  const conversation = await repos.conversations.findByStudentAndCourse(
    enrollment.studentEmail,
    enrollment.courseId,
  );
  return conversationToMessages(conversation);
}

export async function sendStudentMessage(
  user: StoredUser,
  enrollmentId: string,
  text: string,
): Promise<ChatMessageDTO[]> {
  const repos = getRepositories();
  const enrollment = await loadEnrollment(enrollmentId, user);
  const course = await repos.courses.findById(enrollment.courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (enrollment.status === "Pendiente") {
    throw forbidden("La mensajería se habilita cuando se aprueba tu acceso.");
  }

  const conversation = await ensureConversation(enrollment, course);
  const message: StoredMessage = {
    id: newId("msg"),
    from: "me",
    text,
    time: `Tú · ${clock()}`,
    createdAt: nowIso(),
  };
  const updated = await repos.conversations.addMessage(conversation.id, message);
  return conversationToMessages(updated ?? conversation);
}

function teacherTime(name: string) {
  const last = name.trim().split(/\s+/).pop() ?? name;
  return `Prof. ${last} · ${clock()}`;
}

export async function listTeacherConversations(user: StoredUser): Promise<ConversationDTO[]> {
  const repos = getRepositories();
  const conversations = await repos.conversations.listByTeacher(user.email);
  const courses = await repos.courses.list();
  const byId = new Map(courses.map((course) => [course.legacyId, course]));

  return conversations.map((conversation) => ({
    id: conversation.id,
    courseId: conversation.courseId,
    courseTitle: byId.get(conversation.courseId)?.title ?? "Curso",
    peerName: conversation.studentName,
    peerEmail: conversation.studentEmail,
    messages: conversationToMessages(conversation),
  }));
}

export async function sendTeacherMessage(
  user: StoredUser,
  conversationId: string,
  text: string,
): Promise<ChatMessageDTO[]> {
  const repos = getRepositories();
  const conversation = await repos.conversations.findById(conversationId);
  if (!conversation) throw notFound("Conversación no encontrada.");
  if (conversation.teacherEmail.toLowerCase() !== user.email.toLowerCase() && user.role !== "admin") {
    throw forbidden("No participás en esta conversación.");
  }

  const message: StoredMessage = {
    id: newId("msg"),
    from: "prof",
    text,
    time: teacherTime(user.name),
    createdAt: nowIso(),
  };
  const updated = await repos.conversations.addMessage(conversation.id, message);
  return conversationToMessages(updated ?? conversation);
}

export async function getConversationForTeacher(
  user: StoredUser,
  conversationId: string,
): Promise<ConversationDTO> {
  const repos = getRepositories();
  const conversation = await repos.conversations.findById(conversationId);
  if (!conversation) throw notFound("Conversación no encontrada.");
  if (conversation.teacherEmail.toLowerCase() !== user.email.toLowerCase() && user.role !== "admin") {
    throw forbidden("No participás en esta conversación.");
  }
  const course = await repos.courses.findById(conversation.courseId);
  return {
    id: conversation.id,
    courseId: conversation.courseId,
    courseTitle: course?.title ?? "Curso",
    peerName: conversation.studentName,
    peerEmail: conversation.studentEmail,
    messages: conversationToMessages(conversation),
  };
}
