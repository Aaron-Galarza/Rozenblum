import type { ChatMessageDTO, ConversationDTO } from "@rozenblum/shared";
import { ApiError, forbidden, notFound } from "../lib/http.js";
import { publishChatChanged } from "../lib/chat-events.js";
import type { Pagination } from "../lib/pagination.js";
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
import { conversationToMessages, courseIndex, hasEnrollmentAccess } from "./mappers.js";

/** One page of history plus its real length, so routes can expose both. */
export type MessagePage = { messages: ChatMessageDTO[]; total: number };
const LATEST_MESSAGE_PAGE: Pagination = { limit: 500, offset: 0 };

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

async function messagePage(
  conversation: StoredConversation | null,
  viewerEmail: string,
  page?: Pagination,
): Promise<MessagePage> {
  if (!conversation) return { messages: [], total: 0 };
  const stored = await getRepositories().conversations.listMessages(conversation.id, page);
  const messages = stored?.messages ?? [];
  return {
    messages: conversationToMessages({ ...conversation, messages }, viewerEmail),
    total: stored?.total ?? conversation.messages.length,
  };
}

async function appendMessage(
  conversation: StoredConversation,
  user: StoredUser,
  text: string,
): Promise<ChatMessageDTO[]> {
  const message: StoredMessage = {
    id: newId("msg"), authorEmail: user.email.toLowerCase(), authorRole: user.role,
    text, time: `Tú · ${formatTime()}`, createdAt: nowIso(),
  };
  const result = await getRepositories().conversations.addMessage(conversation.id, message);
  if (result === "missing") throw notFound("Conversación no encontrada.");
  if (result === "limit") throw new ApiError(429, "CHAT_DAILY_LIMIT",
    "Este chat alcanzó el límite de 100 mensajes de hoy. Podés volver a escribir mañana.");
  publishChatChanged(conversation.courseId, conversation.studentEmail);
  return (await messagePage(conversation, user.email, LATEST_MESSAGE_PAGE)).messages;
}

export async function listStudentMessages(
  user: StoredUser,
  enrollmentId: string,
  page?: Pagination,
): Promise<MessagePage> {
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
  return messagePage(conversation, user.email, page);
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
  return appendMessage(conversation, user, text);
}

export async function listTeacherConversations(user: StoredUser): Promise<ConversationDTO[]> {
  const repos = getRepositories();
  const conversations = await repos.conversations.listByTeacher(user.email);
  const courses = await repos.courses.list();
  const byId = courseIndex(courses);
  const enrollments = await Promise.all(conversations.map((conversation) =>
    repos.enrollments.findByStudentAndCourse(conversation.studentEmail, conversation.courseId)));
  const accessible = new Set(enrollments.filter((item) => item && hasEnrollmentAccess(item))
    .map((item) => `${item!.courseId}:${item!.studentEmail.toLowerCase()}`));

  return conversations.filter((conversation) => accessible.has(
    `${conversation.courseId}:${conversation.studentEmail.toLowerCase()}`)).map((conversation) => ({
    id: conversation.id,
    courseId: conversation.courseId,
    courseTitle: byId.get(conversation.courseId)?.title ?? "Curso",
    peerName: conversation.studentName,
    peerEmail: conversation.studentEmail,
    messages: conversationToMessages(conversation, user.email),
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
  page?: Pagination,
): Promise<MessagePage> {
  const { enrollment } = await loadTeacherStudentEnrollment(user, courseId, enrollmentId);
  const conversation = await getRepositories().conversations.findByStudentAndCourse(
    enrollment.studentEmail, courseId,
  );
  return messagePage(conversation, user.email, page);
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
  const enrollment = await getRepositories().enrollments.findByStudentAndCourse(
    conversation.studentEmail, conversation.courseId);
  if (!enrollment) throw notFound("Inscripción no encontrada.");
  assertEnrollmentAccess(enrollment, {
    expired: "El acceso del alumno a este curso venció.",
    denied: "La mensajería se habilita cuando se aprueba el acceso del alumno.",
  });
  return conversation;
}

export async function sendTeacherMessage(
  user: StoredUser,
  conversationId: string,
  text: string,
): Promise<ChatMessageDTO[]> {
  const conversation = await loadTeacherConversation(user, conversationId);
  return appendMessage(conversation, user, text);
}

export async function getConversationForTeacher(
  user: StoredUser,
  conversationId: string,
  page?: Pagination,
): Promise<{ conversation: ConversationDTO; total: number }> {
  const repos = getRepositories();
  const conversation = await loadTeacherConversation(user, conversationId);
  const course = await repos.courses.findById(conversation.courseId);
  const history = await messagePage(conversation, user.email, page);
  return {
    conversation: {
      id: conversation.id,
      courseId: conversation.courseId,
      courseTitle: course?.title ?? "Curso",
      peerName: conversation.studentName,
      peerEmail: conversation.studentEmail,
      messages: history.messages,
    },
    total: history.total,
  };
}
