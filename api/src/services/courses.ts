import type {
  CourseDTO,
  CourseDetailDTO,
  LessonBlockDTO,
  LessonType,
  RichLessonDocument,
  ModuleDTO,
} from "@rozenblum/shared";
import { richLessonDocumentSchema } from "@rozenblum/shared";
import { badRequest, conflict, forbidden, notFound } from "../lib/http.js";
import { nowIso } from "../lib/utils.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredCourse, StoredLesson, StoredModule, StoredUser } from "../types.js";
import { authoringModulesToDTO, courseStructure, courseToDTO, courseToPublicDTO, enrollmentToDTO } from "./mappers.js";
import { assertManagedImageUrl } from "./media.js";
import { recordAdminEvent, safeCourseState } from "./audit.js";

/** Optional controls shared by every authoring mutation. */
type MutationOptions = {
  /** Revision the client loaded before editing. Omit for legacy clients. */
  expectedRevision?: number;
  /** Idempotency key for creation endpoints. */
  requestId?: string;
};

/** Module mutations return the new list plus the course revision it produced. */
export type ModuleMutationResult = {
  modules: ModuleDTO[];
  revision: number;
};

function courseRevision(course: StoredCourse): number {
  return course.revision ?? 0;
}

function revisionConflict(course: StoredCourse) {
  return conflict("El curso cambió mientras lo editabas. Recargá e intentá nuevamente.", {
    currentRevision: courseRevision(course),
    updatedAt: course.updatedAt,
  });
}

function assertExpectedRevision(
  course: StoredCourse,
  expectedRevision: number | undefined,
): void {
  if (expectedRevision !== undefined && expectedRevision !== courseRevision(course)) {
    throw revisionConflict(course);
  }
}

function moduleResult(course: StoredCourse): ModuleMutationResult {
  return { modules: authoringModulesToDTO(course), revision: courseRevision(course) };
}

export function canManageCourse(course: StoredCourse, user: StoredUser): boolean {
  if (user.role === "admin") return true;
  if (user.role !== "profesor") return false;
  return course.professorEmail?.toLowerCase() === user.email.toLowerCase();
}

async function resolveProfessor(email: string): Promise<StoredUser> {
  const professor = await getRepositories().users.findByEmail(email);
  if (!professor || professor.role !== "profesor" || professor.status !== "Activo") {
    throw badRequest("Seleccioná un profesor activo y registrado.");
  }
  return professor;
}

/** Loads a course and checks edit rights; every authoring mutation needs both. */
export async function loadManagedCourse(courseId: number, user: StoredUser): Promise<StoredCourse> {
  const course = await getRepositories().courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");
  return course;
}

export async function listPublishedCourses(): Promise<CourseDTO[]> {
  const courses = await getRepositories().courses.listPublished();
  return courses.map(courseToPublicDTO);
}

export async function getLatestPublishedCourse(): Promise<CourseDetailDTO> {
  const latest = await getRepositories().courses.findLatestPublished();
  if (!latest) throw notFound("No hay cursos publicados.");
  return buildPublishedCourseDetail(latest);
}

/**
 * Public course detail: syllabus/curriculum outline only. Lesson bodies are
 * intentionally excluded — they belong to enrolled students.
 */
export async function getPublishedCourseDetail(slug: string): Promise<CourseDetailDTO> {
  const course = await getRepositories().courses.findBySlug(slug);
  return buildPublishedCourseDetail(course);
}

async function buildPublishedCourseDetail(course: StoredCourse | null): Promise<CourseDetailDTO> {
  if (!course || course.status !== "published") {
    throw notFound("Curso no encontrado.");
  }

  const professor = await getRepositories().users.findByEmail(course.professorEmail);
  return {
    course: courseToPublicDTO(course),
    professor: { name: professor?.name ?? course.professor, ...(professor?.img ? { img: professor.img } : {}) },
    modules: [...course.modules]
      .sort((a, b) => a.position - b.position)
      .map((mod) => ({
        id: mod.id,
        title: mod.title,
        status: "locked",
        position: mod.position,
        lessons: [...mod.lessons]
          .sort((a, b) => a.position - b.position)
          .map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            type: lesson.type,
            done: false,
            highlight: lesson.highlight,
            position: lesson.position,
          })),
      })),
  };
}

export async function getCourseStructureForTeacher(
  courseId: number,
  user: StoredUser,
): Promise<ReturnType<typeof courseStructure>> {
  const course = await loadManagedCourse(courseId, user);
  return courseStructure(course);
}

export async function getTeacherCourseList(user: StoredUser): Promise<CourseDTO[]> {
  const courses = await getRepositories().courses.list();
  return courses.filter((course) => canManageCourse(course, user)).map(courseToDTO);
}

/** Safe recovery for a course creation whose response was lost. */
export async function getCourseByRequestId(requestId: string): Promise<CourseDTO> {
  const course = await getRepositories().courses.findByRequestId(requestId);
  if (!course) throw notFound("No se encontró un curso creado con esa clave.");
  return courseToDTO(course);
}

export async function updateCourse(
  courseId: number,
  patch: Partial<StoredCourse>,
  user: StoredUser,
  options: { expectedRevision?: number } = {},
): Promise<CourseDTO> {
  const repos = getRepositories();
  const course = await loadManagedCourse(courseId, user);
  assertExpectedRevision(course, options.expectedRevision);
  if (patch.img) assertManagedImageUrl(patch.img, "courses");
  if (patch.professorEmail && user.role !== "admin") {
    throw forbidden("Solo un administrador puede asignar profesores.");
  }
  const professor = patch.professorEmail
    ? await resolveProfessor(patch.professorEmail)
    : patch.status === "published"
      ? await resolveProfessor(course.professorEmail)
      : null;
  if (patch.status === "published" && !course.modules.some((mod) => mod.lessons.length > 0)) {
    throw badRequest("Agregá al menos una lección antes de publicar el curso.");
  }
  if (patch.status === "published" && !(patch.img ?? course.img)) {
    throw badRequest("Seleccioná una imagen del curso antes de publicarlo.");
  }
  const nextPatch = professor && patch.professorEmail
    ? { ...patch, professor: professor.name, professorEmail: professor.email }
    : patch;
  if (course.status === "published" || patch.status === "published") {
    nextPatch.everPublished = true;
  }
  const updated = await repos.courses.update(
    courseId,
    nextPatch,
    options.expectedRevision ?? courseRevision(course),
  );
  if (!updated) {
    const current = await repos.courses.findById(courseId);
    if (current) throw revisionConflict(current);
    throw notFound("Curso no encontrado.");
  }

  // Course threads follow the current professor. Without this, a former
  // professor would keep reading and answering the course conversations.
  if (
    updated.professorEmail &&
    updated.professorEmail.toLowerCase() !== course.professorEmail.toLowerCase()
  ) {
    await repos.conversations.reassignTeacher(
      courseId,
      updated.professorEmail,
      updated.professor,
    );
  }

  if (user.role === "admin") {
    await recordAdminEvent({
      actor: user,
      action: "update",
      entity: "course",
      entityId: String(courseId),
      reason: "Edición administrativa del curso.",
      previousState: safeCourseState(course),
      nextState: safeCourseState(updated),
    });
  }

  return courseToDTO(updated);
}

export async function deleteCourse(
  courseId: number,
  user: StoredUser,
  options: { expectedRevision?: number } = {},
): Promise<void> {
  const repos = getRepositories();
  const course = await repos.courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  assertExpectedRevision(course, options.expectedRevision);
  if (course.status === "published" || course.everPublished) {
    throw badRequest("Un curso que ya fue publicado no se puede eliminar.");
  }
  if (await repos.enrollments.existsByCourse(courseId) ||
      await repos.orders.existsByCourse(courseId)) {
    throw badRequest("El curso tiene inscripciones u órdenes y no se puede eliminar.");
  }
  if (!await repos.courses.delete(courseId, options.expectedRevision ?? courseRevision(course))) {
    const current = await repos.courses.findById(courseId);
    if (current) throw revisionConflict(current);
    throw notFound("Curso no encontrado.");
  }
  await recordAdminEvent({
    actor: user,
    action: "delete",
    entity: "course",
    entityId: String(courseId),
    reason: "Eliminación administrativa del curso.",
    previousState: safeCourseState(course),
  });
}

async function assertAcademicDeletionAllowed(course: StoredCourse): Promise<void> {
  const repos = getRepositories();
  if (course.status === "published" || course.everPublished ||
      await repos.enrollments.existsByCourse(course.legacyId) ||
      await repos.orders.existsByCourse(course.legacyId)) {
    throw badRequest("El contenido de un curso lanzado o con inscripciones no se puede borrar; podés editarlo.");
  }
}

function findModule(course: StoredCourse, moduleId: number): StoredModule {
  const mod = course.modules.find((item) => item.id === moduleId);
  if (!mod) throw notFound("Módulo no encontrado.");
  return mod;
}

function nextModuleId(course: StoredCourse): number {
  return course.modules.reduce((max, mod) => Math.max(max, mod.id), course.legacyId * 100) + 1;
}

function nextLessonId(course: StoredCourse, mod: StoredModule): { id: string; number: number } {
  const prefix = `${mod.position + 1}.`;
  const previousMaximum = course.modules.reduce((maximum, item) =>
    item.lessons.reduce((current, lesson) => {
      const suffix = Number(lesson.id.split(".").at(-1));
      return Number.isSafeInteger(suffix) && suffix > current ? suffix : current;
    }, maximum), 0);
  const number = Math.max(course.nextLessonNumber ?? 0, previousMaximum) + 1;
  return { id: `${prefix}${number}`, number };
}

async function persistModules(
  course: StoredCourse,
  modules: StoredModule[],
  nextLessonNumber: number | undefined,
  options: MutationOptions,
): Promise<StoredCourse> {
  assertExpectedRevision(course, options.expectedRevision);
  const invalidDocument = modules.some((mod) =>
    mod.lessons.some(
      (lesson) => lesson.document && !richLessonDocumentSchema.safeParse(lesson.document).success,
    ),
  );
  if (invalidDocument) throw badRequest("El documento de una lección no es válido.");
  const imageUrls = (value: unknown): string[] => {
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap(imageUrls);
    const block = value as { type?: string; props?: { url?: unknown }; children?: unknown[] };
    return [
      ...(block.type === "image" ? [String(block.props?.url ?? "")] : []),
      ...imageUrls(block.children),
    ];
  };
  for (const mod of modules) for (const lesson of mod.lessons) for (const url of imageUrls(lesson.document?.blocks)) {
    assertManagedImageUrl(url, "lessons");
  }
  const repos = getRepositories();
  const updated = await repos.courses.saveModules(
    course.legacyId,
    modules,
    options.expectedRevision ?? courseRevision(course),
    nextLessonNumber,
  );
  if (!updated) {
    const current = await repos.courses.findById(course.legacyId);
    if (current) throw revisionConflict(current);
    throw notFound("Curso no encontrado.");
  }
  return updated;
}

function findLessonByRequestId(course: StoredCourse, requestId: string): StoredLesson | undefined {
  for (const mod of course.modules) {
    const lesson = mod.lessons.find((item) => item.requestId === requestId);
    if (lesson) return lesson;
  }
  return undefined;
}

/** Re-read after a failed save to recover a creation that did commit. */
async function recoverModuleCreation(
  courseId: number,
  requestId: string | undefined,
): Promise<ModuleMutationResult | null> {
  if (!requestId) return null;
  const latest = await getRepositories().courses.findById(courseId);
  if (!latest) return null;
  return latest.modules.some((mod) => mod.requestId === requestId)
    ? moduleResult(latest)
    : null;
}

async function recoverLessonCreation(
  courseId: number,
  requestId: string | undefined,
): Promise<ModuleMutationResult | null> {
  if (!requestId) return null;
  const latest = await getRepositories().courses.findById(courseId);
  if (!latest) return null;
  return findLessonByRequestId(latest, requestId) ? moduleResult(latest) : null;
}

export async function addModule(
  courseId: number,
  title: string,
  user: StoredUser,
  options: MutationOptions = {},
): Promise<ModuleMutationResult> {
  const course = await loadManagedCourse(courseId, user);

  if (options.requestId && course.modules.some((mod) => mod.requestId === options.requestId)) {
    return moduleResult(course);
  }
  assertExpectedRevision(course, options.expectedRevision);

  const modules = [
    ...course.modules,
    {
      id: nextModuleId(course),
      title: title.trim(),
      position: Math.max(-1, ...course.modules.map((mod) => mod.position)) + 1,
      lessons: [],
      requestId: options.requestId,
      createdBy: user.id,
      createdAt: nowIso(),
      updatedBy: user.id,
      updatedAt: nowIso(),
    },
  ];
  try {
    const updated = await persistModules(course, modules, undefined, options);
    return moduleResult(updated);
  } catch (error) {
    const recovered = await recoverModuleCreation(courseId, options.requestId);
    if (recovered) return recovered;
    throw error;
  }
}

export async function updateModule(
  courseId: number,
  moduleId: number,
  patch: { title?: string },
  user: StoredUser,
  options: { expectedRevision?: number } = {},
): Promise<ModuleMutationResult> {
  const course = await loadManagedCourse(courseId, user);
  findModule(course, moduleId);
  assertExpectedRevision(course, options.expectedRevision);

  const modules = course.modules.map((mod) =>
    mod.id === moduleId ? {
      ...mod, title: patch.title?.trim() || mod.title,
      updatedBy: user.id, updatedAt: nowIso(),
    } : mod,
  );
  const updated = await persistModules(course, modules, undefined, options);
  return moduleResult(updated);
}

export async function deleteModule(
  courseId: number,
  moduleId: number,
  user: StoredUser,
  options: { expectedRevision?: number } = {},
): Promise<ModuleMutationResult> {
  const course = await loadManagedCourse(courseId, user);
  findModule(course, moduleId);
  assertExpectedRevision(course, options.expectedRevision);
  await assertAcademicDeletionAllowed(course);

  const modules = [...course.modules]
    .sort((a, b) => a.position - b.position)
    .filter((mod) => mod.id !== moduleId)
    .map((mod, index) => ({ ...mod, position: index }));
  const updated = await persistModules(course, modules, undefined, options);
  return moduleResult(updated);
}

export async function reorderModules(
  courseId: number,
  ids: number[],
  user: StoredUser,
  options: { expectedRevision?: number } = {},
): Promise<ModuleMutationResult> {
  const course = await loadManagedCourse(courseId, user);
  assertExpectedRevision(course, options.expectedRevision);
  if (ids.length !== course.modules.length || new Set(ids).size !== ids.length) {
    throw badRequest("El orden debe incluir todos los módulos del curso.");
  }

  const ordered = ids.map((id) => findModule(course, id));
  const modules = ordered.map((mod, index) => ({
    ...mod, position: index, updatedBy: user.id, updatedAt: nowIso(),
  }));
  const updated = await persistModules(course, modules, undefined, options);
  return moduleResult(updated);
}

export async function addLesson(
  courseId: number,
  moduleId: number,
  input: { title: string; type: LessonType; content?: LessonBlockDTO[]; document?: RichLessonDocument },
  user: StoredUser,
  options: MutationOptions = {},
): Promise<ModuleMutationResult> {
  const course = await loadManagedCourse(courseId, user);
  const mod = findModule(course, moduleId);

  if (options.requestId && findLessonByRequestId(course, options.requestId)) {
    return moduleResult(course);
  }
  assertExpectedRevision(course, options.expectedRevision);

  const next = nextLessonId(course, mod);
  const lesson: StoredLesson = {
    id: next.id,
    title: input.title.trim(),
    type: input.type,
    position: Math.max(-1, ...mod.lessons.map((item) => item.position)) + 1,
    content: input.content ?? [],
    document: input.document,
    requestId: options.requestId,
    createdBy: user.id,
    createdAt: nowIso(),
    updatedBy: user.id,
    updatedAt: nowIso(),
  };

  const modules = course.modules.map((item) =>
    item.id === moduleId ? { ...item, lessons: [...item.lessons, lesson] } : item,
  );
  try {
    const updated = await persistModules(course, modules, next.number, options);
    return moduleResult(updated);
  } catch (error) {
    const recovered = await recoverLessonCreation(courseId, options.requestId);
    if (recovered) return recovered;
    throw error;
  }
}

export async function updateLesson(
  courseId: number,
  moduleId: number,
  lessonId: string,
  patch: { title?: string; type?: LessonType; content?: LessonBlockDTO[]; document?: RichLessonDocument },
  user: StoredUser,
  options: { expectedRevision?: number } = {},
): Promise<ModuleMutationResult> {
  const course = await loadManagedCourse(courseId, user);
  const mod = findModule(course, moduleId);
  if (!mod.lessons.some((lesson) => lesson.id === lessonId)) {
    throw notFound("Lección no encontrada.");
  }
  assertExpectedRevision(course, options.expectedRevision);

  const modules = course.modules.map((item) =>
    item.id === moduleId
      ? {
          ...item,
          lessons: item.lessons.map((lesson) =>
            lesson.id === lessonId
              ? {
                  ...lesson,
                  title: patch.title?.trim() || lesson.title,
                  type: patch.type ?? lesson.type,
                  content: patch.content ?? lesson.content,
                  document: patch.document ?? lesson.document,
                  updatedBy: user.id,
                  updatedAt: nowIso(),
                }
              : lesson,
          ),
        }
      : item,
  );
  const updated = await persistModules(course, modules, undefined, options);
  return moduleResult(updated);
}

export async function deleteLesson(
  courseId: number,
  moduleId: number,
  lessonId: string,
  user: StoredUser,
  options: { expectedRevision?: number } = {},
): Promise<ModuleMutationResult> {
  const course = await loadManagedCourse(courseId, user);
  const mod = findModule(course, moduleId);
  if (!mod.lessons.some((lesson) => lesson.id === lessonId)) {
    throw notFound("Lección no encontrada.");
  }
  assertExpectedRevision(course, options.expectedRevision);
  await assertAcademicDeletionAllowed(course);

  const modules = course.modules.map((item) =>
    item.id === moduleId
      ? {
          ...item,
          lessons: [...item.lessons]
            .sort((a, b) => a.position - b.position)
            .filter((lesson) => lesson.id !== lessonId)
            .map((lesson, index) => ({ ...lesson, position: index })),
        }
      : item,
  );
  const updated = await persistModules(course, modules, undefined, options);
  return moduleResult(updated);
}

export async function reorderLessons(
  courseId: number,
  moduleId: number,
  ids: string[],
  user: StoredUser,
  options: { expectedRevision?: number } = {},
): Promise<ModuleMutationResult> {
  const course = await loadManagedCourse(courseId, user);
  const mod = findModule(course, moduleId);
  assertExpectedRevision(course, options.expectedRevision);
  if (ids.length !== mod.lessons.length || new Set(ids).size !== ids.length) {
    throw badRequest("El orden debe incluir todas las lecciones del módulo.");
  }

  const ordered = ids.map((id) => {
    const lesson = mod.lessons.find((item) => item.id === id);
    if (!lesson) throw notFound("Lección no encontrada.");
    return lesson;
  });

  const modules = course.modules.map((item) =>
    item.id === moduleId
      ? { ...item, lessons: ordered.map((lesson, index) => ({
          ...lesson, position: index, updatedBy: user.id, updatedAt: nowIso(),
        })) }
      : item,
  );
  const updated = await persistModules(course, modules, undefined, options);
  return moduleResult(updated);
}

export async function listCourseEnrollments(courseId: number, user: StoredUser) {
  const repos = getRepositories();
  const course = await loadManagedCourse(courseId, user);
  const enrollments = await repos.enrollments.listByCourseIds([courseId]);
  return enrollments.map((enrollment) => enrollmentToDTO(enrollment, course));
}

export async function createEmptyCourseForAdmin(
  input: {
    title: string;
    description: string;
    priceCents: number;
    professorEmail: string;
    level?: string;
    duration?: string;
    img?: string;
    accessDays?: number;
  },
  requestId: string | undefined,
  actor: StoredUser,
): Promise<CourseDTO> {
  if (requestId) {
    const existing = await getRepositories().courses.findByRequestId(requestId);
    if (existing) return courseToDTO(existing);
  }
  if (input.img) assertManagedImageUrl(input.img, "courses");
  const professor = await resolveProfessor(input.professorEmail);
  const course = await getRepositories().courses.create({
    title: input.title,
    description: input.description,
    priceCents: input.priceCents,
    level: input.level ?? "Inicial",
    duration: input.duration ?? "On-Demand",
    professor: professor.name,
    professorEmail: professor.email,
    status: "draft",
    img: input.img ?? "",
    requestId,
    accessDays: input.accessDays,
  });
  await recordAdminEvent({
    actor,
    action: "create",
    entity: "course",
    entityId: String(course.legacyId),
    reason: "Alta administrativa del curso.",
    nextState: safeCourseState(course),
  });
  return courseToDTO(course);
}
