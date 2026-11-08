import type { ChatMessageDTO, ConversationDTO } from "@rozenblum/shared";
import { forbidden, notFound } from "../lib/http.js";
import { newId, nowIso } from "../lib/utils.js";
import { getRepositories } from "../repositories/index.js";
import type {
  StoredConversation,
  StoredCourse,
  StoredEnrollment,
  StoredMessage,
  StoredUser,
} from "../types.js";
import { canManageCourse } from "./courses.js";
import { loadEnrollment } from "./classroom.js";
import { conversationToMessages } from "./mappers.js";

const clock = () =>
  new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(),
  );

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

  try {
    return await repos.conversations.create({
      id: newId("cnv"),
      courseId: course.legacyId,
      studentEmail: enrollment.studentEmail,
      studentName: enrollment.studentName,
      teacherEmail: teacher?.email ?? course.professorEmail ?? "",
      teacherName: teacher?.name ?? course.professor,
      messages: [],
    });
  } catch (cause) {
    // The student and teacher may open the same new chat simultaneously.
    if ((cause as { code?: number }).code !== 11000) throw cause;
    const created = await repos.conversations.findByStudentAndCourse(
      enrollment.studentEmail, course.legacyId,
    );
    if (!created) throw cause;
    return created;
  }
}

export async function listStudentMessages(
  user: StoredUser,
  enrollmentId: string,
): Promise<ChatMessageDTO[]> {
  const repos = getRepositories();
  const enrollment = await loadEnrollment(enrollmentId, user);
  if (enrollment.status === "Pendiente" || enrollment.status === "Revocado") {
    throw forbidden("La mensajería se habilita cuando se aprueba tu acceso.");
  }
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
  if (enrollment.status === "Pendiente" || enrollment.status === "Revocado") {
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

async function loadTeacherStudentEnrollment(user: StoredUser, courseId: number, enrollmentId: string) {
  const repos = getRepositories();
  const course = await repos.courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");
  const enrollment = await repos.enrollments.findById(enrollmentId);
  if (!enrollment || enrollment.courseId !== courseId) throw notFound("Inscripción no encontrada.");
  if (enrollment.status === "Pendiente" || enrollment.status === "Revocado") {
    throw forbidden("La mensajería se habilita cuando se aprueba el acceso del alumno.");
  }
  return { course, enrollment };
}

export async function listTeacherStudentMessages(
  user: StoredUser,
  courseId: number,
  enrollmentId: string,
): Promise<ChatMessageDTO[]> {
  const { enrollment } = await loadTeacherStudentEnrollment(user, courseId, enrollmentId);
  const conversation = await getRepositories().conversations.findByStudentAndCourse(
    enrollment.studentEmail, courseId,
  );
  return conversationToMessages(conversation);
}

export async function sendTeacherStudentMessage(
  user: StoredUser,
  courseId: number,
  enrollmentId: string,
  text: string,
): Promise<ChatMessageDTO[]> {
  const { course, enrollment } = await loadTeacherStudentEnrollment(user, courseId, enrollmentId);
  const conversation = await ensureConversation(enrollment, course);
  return sendTeacherMessage(user, conversation.id, text);
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
