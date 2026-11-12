import type {
  AdminAlumnoDTO,
  AdminCursoDTO,
  AdminProfesorDTO,
  ChatMessageDTO,
  CourseDTO,
  EnrollmentDTO,
  ModuleDTO,
  ModuleStatus,
  OrderDTO,
  UserDTO,
} from "@rozenblum/shared";
import type {
  CourseStructure,
  StoredConversation,
  StoredCourse,
  StoredEnrollment,
  StoredMessage,
  StoredOrder,
  PublicCourseRecord,
  StoredUser,
} from "../types.js";
import { courseEnrollmentClosesAt } from "../lib/course-expiry.js";

export function userToDTO(user: StoredUser): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.initials,
    status: user.status,
    img: user.img,
  };
}

function baseCourseDTO(course: PublicCourseRecord): CourseDTO {
  return {
    id: course.legacyId,
    slug: course.slug,
    title: course.title,
    description: course.description,
    price: course.price,
    priceCents: course.priceCents,
    modules: course.modules.length,
    duration: course.duration,
    level: course.level,
    img: course.img,
    professor: course.professor,
    status: course.status,
    temario: course.temario.map(({ mod, title, lessons }) => ({ mod, title, lessons: [...lessons] })),
    ...(course.accessDays !== undefined ? { accessDays: course.accessDays } : {}),
    ...(course.expiresOn ? { expiresOn: course.expiresOn } : {}),
    ...(course.expiresOn ? { enrollmentClosesAt: courseEnrollmentClosesAt(course.expiresOn) } : {}),
  };
}

export function courseToDTO(course: StoredCourse): CourseDTO {
  return {
    ...baseCourseDTO(course),
    professorId: course.professorEmail,
    revision: course.revision ?? 0,
  };
}

/** Public catalogue shape, without the professor's login email. */
export function courseToPublicDTO(course: PublicCourseRecord): CourseDTO {
  return baseCourseDTO(course);
}

export function moduleStatuses(
  course: StoredCourse,
  completedLessonIds: string[],
): Map<number, ModuleStatus> {
  const statuses = new Map<number, ModuleStatus>();
  const completed = new Set(completedLessonIds);
  let previousCompleted = true;

  for (const mod of course.modules) {
    const total = mod.lessons.length;
    const done = mod.lessons.filter((lesson) => completed.has(lesson.id)).length;

    if (total > 0 && done === total) {
      statuses.set(mod.id, "completed");
      previousCompleted = true;
      continue;
    }

    // An empty module has nothing to unlock, but it must not lock the rest of
    // the course. Preserve the previous module's completion state.
    if (total === 0) {
      statuses.set(mod.id, "locked");
      continue;
    }

    if (previousCompleted) {
      statuses.set(mod.id, "in_progress");
      previousCompleted = false;
      continue;
    }

    statuses.set(mod.id, "locked");
    previousCompleted = false;
  }

  return statuses;
}

export function computeProgress(course: StoredCourse, completedLessonIds: string[]): number {
  const total = course.modules.reduce((sum, mod) => sum + mod.lessons.length, 0);
  if (total === 0) return 0;
  const completed = new Set(completedLessonIds);
  const done = course.modules.reduce(
    (sum, mod) => sum + mod.lessons.filter((lesson) => completed.has(lesson.id)).length,
    0,
  );
  return Math.round((done / total) * 100);
}

export function totalLessons(course: StoredCourse): number {
  return course.modules.reduce((sum, mod) => sum + mod.lessons.length, 0);
}

/** A purchased access window that has already elapsed. */
export function isEnrollmentExpired(
  enrollment: Pick<StoredEnrollment, "expiresAt">,
  now = Date.now(),
): boolean {
  if (!enrollment.expiresAt) return false;
  const expiresAt = Date.parse(enrollment.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

/** Pending, revoked and expired enrollments cannot open the classroom. */
export function hasEnrollmentAccess(
  enrollment: Pick<StoredEnrollment, "status" | "expiresAt">,
  now = Date.now(),
): boolean {
  return (
    enrollment.status !== "Pendiente" &&
    enrollment.status !== "Revocado" &&
    !isEnrollmentExpired(enrollment, now)
  );
}

type ModuleMappingOptions = {
  statuses: Map<number, ModuleStatus>;
  completed: Set<string>;
  includeContent: boolean;
  /** Shape returned when a module or lesson cannot be read. */
  hiddenContent: "empty" | "undefined";
  includeRequestId?: boolean;
  canReadModule?: (moduleId: number) => boolean;
};

function modulesToDTO(course: StoredCourse, options: ModuleMappingOptions): ModuleDTO[] {
  return [...course.modules]
    .sort((a, b) => a.position - b.position)
    .map((mod) => {
      const readable =
        options.includeContent && (options.canReadModule?.(mod.id) ?? true);
      return {
        id: mod.id,
        title: mod.title,
        status: options.statuses.get(mod.id) ?? "locked",
        position: mod.position,
        ...(options.includeRequestId ? { requestId: mod.requestId } : {}),
        lessons: [...mod.lessons]
          .sort((a, b) => a.position - b.position)
          .map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            type: lesson.type,
            done: options.completed.has(lesson.id),
            highlight: lesson.highlight,
            position: lesson.position,
            ...(options.includeRequestId ? { requestId: lesson.requestId } : {}),
            content: readable
              ? lesson.content
              : options.hiddenContent === "empty"
                ? []
                : undefined,
            document: readable ? lesson.document : undefined,
          })),
      };
    });
}

/** Index courses by their public numeric id (`legacyId`). */
export function courseIndex(courses: StoredCourse[]): Map<number, StoredCourse> {
  return new Map(courses.map((course) => [course.legacyId, course]));
}

/** Module list for the authoring view: full content and request ids included. */
export function authoringModulesToDTO(course: StoredCourse): ModuleDTO[] {
  return modulesToDTO(course, {
    statuses: moduleStatuses(course, []),
    completed: new Set(),
    includeContent: true,
    hiddenContent: "empty",
    includeRequestId: true,
  });
}

export function enrollmentToDTO(
  enrollment: StoredEnrollment,
  course: StoredCourse,
): EnrollmentDTO {
  const progress = computeProgress(course, enrollment.completedLessonIds);
  const expired = isEnrollmentExpired(enrollment);
  const canAccess = hasEnrollmentAccess(enrollment);
  const status =
    !canAccess
      ? expired && enrollment.status !== "Revocado"
        ? "Revocado"
        : enrollment.status
      : progress >= 100
        ? "Completado"
        : "Activo";
  const statuses = canAccess ? moduleStatuses(course, enrollment.completedLessonIds) : new Map();
  const completed = new Set(enrollment.completedLessonIds);

  return {
    id: enrollment.id,
    courseId: course.legacyId,
    courseSlug: course.slug,
    courseTitle: course.title,
    courseImg: course.img,
    courseProfessor: course.professor,
    studentName: enrollment.studentName,
    progress,
    status,
    ...(enrollment.expiresAt ? { expiresAt: enrollment.expiresAt } : {}),
    modules: modulesToDTO(course, {
      statuses,
      completed,
      includeContent: canAccess,
      hiddenContent: "empty",
      canReadModule: (moduleId) => statuses.get(moduleId) !== "locked",
    }),
  };
}

export function courseStructure(
  course: StoredCourse,
  completedLessonIds: string[] = [],
  includeContent = true,
): CourseStructure {
  const statuses = moduleStatuses(course, completedLessonIds);
  const completed = new Set(completedLessonIds);

  return {
    course: courseToDTO(course),
    modules: modulesToDTO(course, {
      statuses,
      completed,
      includeContent,
      hiddenContent: "undefined",
      includeRequestId: includeContent,
    }),
  };
}

export function orderToDTO(order: StoredOrder): OrderDTO {
  return {
    id: order.id,
    alumno: order.alumno,
    curso: order.curso,
    monto: order.monto,
    fecha: order.fecha,
    metodo: order.metodo,
    estado: order.estado,
    courseSlug: order.courseSlug,
    externalReference: order.externalReference,
    paymentProvider: order.paymentProvider,
    paymentExpiresAt: order.paymentExpiresAt,
    fulfillmentIssue: order.fulfillmentIssue,
    paymentUrl: !order.fulfillmentIssue &&
      (order.estado === "Pendiente" || order.estado === "Rechazado") &&
      (!order.paymentExpiresAt || Date.parse(order.paymentExpiresAt) > Date.now())
      ? order.paymentUrl : undefined,
  };
}

function messageAuthorName(
  message: StoredMessage,
  conversation: StoredConversation,
): string {
  if (message.authorRole === "admin") return "Administración";
  if (message.authorRole === "profesor" || !message.authorRole && message.from === "prof")
    return conversation.teacherName;
  return conversation.studentName;
}

/**
 * Derives each message's perspective for the reader. Storing "me"/"prof" in the
 * document made the same message look like its author's own on both sides.
 * Legacy messages without authorship fall back to the stored perspective.
 */
export function conversationToMessages(
  conversation: StoredConversation | null,
  viewerEmail?: string,
): ChatMessageDTO[] {
  if (!conversation) return [];
  const viewer = viewerEmail?.toLowerCase();
  return conversation.messages.map((message) => {
    const authorRole = message.authorRole ?? (message.from === "me" ? "alumno" : "profesor");
    const authorName = messageAuthorName(message, conversation);
    const createdAt = message.createdAt;
    const time = Number.isFinite(Date.parse(createdAt))
      ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires",
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date(createdAt)) : message.time;
    if (!message.authorEmail || !viewer) {
      return {
        id: message.id,
        from: message.from ?? "prof",
        authorRole, authorName, createdAt,
        text: message.text,
        time,
      };
    }
    const own = message.authorEmail.toLowerCase() === viewer;
    return {
      id: message.id,
      from: own ? "me" : "prof",
      authorRole, authorName, createdAt,
      text: message.text,
      time,
    };
  });
}

export function adminAlumno(
  user: StoredUser,
  courseCount: number,
  progress: number,
  fecha: string,
): AdminAlumnoDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    cursos: courseCount,
    progress,
    fecha,
    estado: user.status,
  };
}

export function adminProfesor(
  user: StoredUser,
  courses: number,
  students: number,
): AdminProfesorDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    cursos: courses,
    alumnos: students,
    estado: user.status,
    img: user.img,
  };
}

export function adminCurso(
  course: StoredCourse,
  students: number,
  completion: number,
): AdminCursoDTO {
  return {
    id: course.legacyId,
    slug: course.slug,
    name: course.title,
    profesor: course.professor,
    alumnos: students,
    completion,
    estado: course.status === "published" ? "Publicado" : "Borrador",
    expiresOn: course.expiresOn,
    revision: course.revision ?? 0,
  };
}
