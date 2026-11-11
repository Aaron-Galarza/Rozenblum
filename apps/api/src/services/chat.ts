import type { ChatMessageDTO, ConversationDTO } from "@rozenblum/shared";
import { forbidden, notFound } from "../lib/http.js";
import { formatTime, newId, nowIso } from "../lib/utils.js";
import { getRepositories } from "../repositories/index.js";
import type {
  StoredConversation,
  StoredCourse,
  StoredEnrollment,
  StoredMessage,
  StoredUser,
} from "../types.js";
import { loadManagedCourse } from "./courses.js";
import { assertEnrollmentAccess, loadEnrollment } from "./classroom.js";
import { conversationToMessages, courseIndex } from "./mappers.js";

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
  assertEnrollmentAccess(enrollment, {
    expired: "Tu acceso a este curso venció.",
    denied: "La mensajería se habilita cuando se aprueba tu acceso.",
  });
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
  assertEnrollmentAccess(enrollment, {
    expired: "Tu acceso a este curso venció.",
    denied: "La mensajería se habilita cuando se aprueba tu acceso.",
  });

  const conversation = await ensureConversation(enrollment, course);
  const message: StoredMessage = {
    id: newId("msg"),
    from: "me",
    text,
    time: `Tú · ${formatTime()}`,
    createdAt: nowIso(),
  };
  const updated = await repos.conversations.addMessage(conversation.id, message);
  return conversationToMessages(updated ?? conversation);
}

function teacherTime(name: string) {
  const last = name.trim().split(/\s+/).pop() ?? name;
  return `Prof. ${last} · ${formatTime()}`;
}

export async function listTeacherConversations(user: StoredUser): Promise<ConversationDTO[]> {
  const repos = getRepositories();
  const conversations = await repos.conversations.listByTeacher(user.email);
  const courses = await repos.courses.list();
  const byId = courseIndex(courses);

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
  const course = await loadManagedCourse(courseId, user);
  const enrollment = await repos.enrollments.findById(enrollmentId);
  if (!enrollment || enrollment.courseId !== courseId) throw notFound("Inscripción no encontrada.");
  assertEnrollmentAccess(enrollment, {
    expired: "El acceso del alumno a este curso venció.",
    denied: "La mensajería se habilita cuando se aprueba el acceso del alumno.",
  });
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

async function loadTeacherConversation(
  user: StoredUser,
  conversationId: string,
): Promise<StoredConversation> {
  const conversation = await getRepositories().conversations.findById(conversationId);
  if (!conversation) throw notFound("Conversación no encontrada.");
  if (
    conversation.teacherEmail.toLowerCase() !== user.email.toLowerCase() &&
    user.role !== "admin"
  ) {
    throw forbidden("No participás en esta conversación.");
  }
  return conversation;
}

export async function sendTeacherMessage(
  user: StoredUser,
  conversationId: string,
  text: string,
): Promise<ChatMessageDTO[]> {
  const repos = getRepositories();
  const conversation = await loadTeacherConversation(user, conversationId);

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
  const conversation = await loadTeacherConversation(user, conversationId);
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
