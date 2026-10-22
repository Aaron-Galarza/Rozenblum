import type {
  AdminAlumnoDTO,
  AdminCursoDTO,
  AdminProfesorDTO,
  ChatMessageDTO,
  CourseDTO,
  EnrollmentDTO,
  ModuleStatus,
  OrderDTO,
  SiteSettingsDTO,
  UserDTO,
} from "@rozenblum/shared";
import type {
  CourseStructure,
  StoredConversation,
  StoredCourse,
  StoredEnrollment,
  StoredOrder,
  StoredSettings,
  StoredUser,
} from "../types.js";

export function userToDTO(user: StoredUser): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.initials,
    status: user.status,
  };
}

export function courseToDTO(course: StoredCourse): CourseDTO {
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
    professorId: course.professorEmail,
    status: course.status,
    temario: course.temario,
  };
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

    if (previousCompleted && (done > 0 || total > 0)) {
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

export function completedCount(course: StoredCourse, completedLessonIds: string[]): number {
  const completed = new Set(completedLessonIds);
  return course.modules.reduce(
    (sum, mod) => sum + mod.lessons.filter((lesson) => completed.has(lesson.id)).length,
    0,
  );
}

export function totalLessons(course: StoredCourse): number {
  return course.modules.reduce((sum, mod) => sum + mod.lessons.length, 0);
}

export function enrollmentToDTO(
  enrollment: StoredEnrollment,
  course: StoredCourse,
): EnrollmentDTO {
  const progress = computeProgress(course, enrollment.completedLessonIds);
  const canAccess = enrollment.status !== "Pendiente" && enrollment.status !== "Revocado";
  const status =
    !canAccess
      ? enrollment.status
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
    modules: course.modules.map((mod) => ({
      id: mod.id,
      title: mod.title,
      status: statuses.get(mod.id) ?? "locked",
      position: mod.position,
      lessons: mod.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        done: completed.has(lesson.id),
        highlight: lesson.highlight,
        position: lesson.position,
        content:
          canAccess && statuses.get(mod.id) !== "locked"
            ? lesson.content
            : [],
        document: canAccess && statuses.get(mod.id) !== "locked" ? lesson.document : undefined,
      })),
    })),
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
    modules: course.modules.map((mod) => ({
      id: mod.id,
      title: mod.title,
      status: statuses.get(mod.id) ?? "locked",
      position: mod.position,
      lessons: mod.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        done: completed.has(lesson.id),
        highlight: lesson.highlight,
        position: lesson.position,
        content: includeContent ? lesson.content : undefined,
        document: includeContent ? lesson.document : undefined,
      })),
    })),
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
  };
}

export function conversationToMessages(conversation: StoredConversation | null): ChatMessageDTO[] {
  if (!conversation) return [];
  return conversation.messages.map((message) => ({
    id: message.id,
    from: message.from,
    text: message.text,
    time: message.time,
  }));
}

export function settingsToDTO(
  settings: StoredSettings,
  paymentsConfigured: boolean,
): SiteSettingsDTO {
  return {
    companyName: settings.companyName,
    supportEmail: settings.supportEmail,
    contactWhatsapp: settings.contactWhatsapp,
    logoUrl: settings.logoUrl,
    privacyText: settings.privacyText,
    paymentProvider: "mercadopago",
    paymentsConfigured,
  };
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
  };
}
