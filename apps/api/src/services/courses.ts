import type {
  CourseDTO,
  CourseDetailDTO,
  LessonBlockDTO,
  LessonType,
  RichLessonDocument,
  ModuleDTO,
} from "@rozenblum/shared";
import { richLessonDocumentSchema } from "@rozenblum/shared";
import { badRequest, forbidden, notFound } from "../lib/http.js";
import { formatArs, newId } from "../lib/utils.js";
import { getRepositories } from "../repositories/index.js";
import type { CourseInput, StoredCourse, StoredLesson, StoredModule, StoredUser } from "../types.js";
import { courseStructure, courseToDTO, enrollmentToDTO, moduleStatuses } from "./mappers.js";
import { assertManagedImageUrl } from "./media.js";

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

export async function listPublishedCourses(): Promise<CourseDTO[]> {
  const courses = await getRepositories().courses.listPublished();
  return courses.map(courseToDTO);
}

export async function getLatestPublishedCourse(): Promise<CourseDetailDTO> {
  const latest = await getRepositories().courses.findLatestPublished();
  if (!latest) throw notFound("No hay cursos publicados.");
  return getPublishedCourseDetail(latest.slug);
}

export async function getPublishedCourse(slug: string): Promise<CourseDTO> {
  const course = await getRepositories().courses.findBySlug(slug);
  if (!course || course.status !== "published") {
    throw notFound("Curso no encontrado.");
  }
  return courseToDTO(course);
}

/**
 * Public course detail: syllabus/curriculum outline only. Lesson bodies are
 * intentionally excluded — they belong to enrolled students.
 */
export async function getPublishedCourseDetail(slug: string): Promise<CourseDetailDTO> {
  const repos = getRepositories();
  const course = await repos.courses.findBySlug(slug);
  if (!course || course.status !== "published") {
    throw notFound("Curso no encontrado.");
  }

  const professor = await repos.users.findByEmail(course.professorEmail);
  return {
    course: courseToDTO(course),
    professor: { name: professor?.name ?? course.professor, ...(professor?.img ? { img: professor.img } : {}) },
    modules: course.modules.map((mod) => ({
      id: mod.id,
      title: mod.title,
      status: "locked",
      position: mod.position,
      lessons: mod.lessons.map((lesson) => ({
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
  const course = await getRepositories().courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");
  return courseStructure(course);
}

export async function getCourseStructureForStudent(
  courseId: number,
  user: StoredUser,
): Promise<ReturnType<typeof courseStructure>> {
  const repos = getRepositories();
  const enrollment = await repos.enrollments.findByStudentAndCourse(user.email, courseId);
  if (!enrollment || enrollment.status === "Pendiente" || enrollment.status === "Revocado") {
    throw forbidden("Tu acceso a este curso todavía no fue aprobado.");
  }
  const course = await repos.courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  return courseStructure(course, enrollment.completedLessonIds);
}

export async function getTeacherCourseList(user: StoredUser): Promise<CourseDTO[]> {
  const courses = await getRepositories().courses.list();
  return courses.filter((course) => canManageCourse(course, user)).map(courseToDTO);
}

export async function createCourse(input: CourseInput, user: StoredUser): Promise<CourseDTO> {
  if (user.role !== "admin") throw forbidden("Solo un administrador puede crear cursos.");
  if (input.img) assertManagedImageUrl(input.img, "courses");
  const professor = await resolveProfessor(input.professorEmail);
  const course = await getRepositories().courses.create({
    ...input, professor: professor.name, professorEmail: professor.email, status: "draft",
  });
  return courseToDTO(course);
}

export async function updateCourse(
  courseId: number,
  patch: Partial<StoredCourse>,
  user: StoredUser,
): Promise<CourseDTO> {
  const repos = getRepositories();
  const course = await repos.courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");
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
  const updated = await repos.courses.update(courseId, nextPatch);
  if (!updated) throw notFound("Curso no encontrado.");

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

  return courseToDTO(updated);
}

export async function deleteCourse(courseId: number): Promise<void> {
  const repos = getRepositories();
  const course = await repos.courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if ((await repos.enrollments.listAll()).some((item) => item.courseId === courseId) ||
      (await repos.orders.list()).some((item) => item.courseId === courseId)) {
    throw badRequest("El curso tiene inscripciones u órdenes y no se puede eliminar.");
  }
  await repos.courses.delete(courseId);
}

function findModule(course: StoredCourse, moduleId: number): StoredModule {
  const mod = course.modules.find((item) => item.id === moduleId);
  if (!mod) throw notFound("Módulo no encontrado.");
  return mod;
}

function nextModuleId(course: StoredCourse): number {
  return course.modules.reduce((max, mod) => Math.max(max, mod.id), course.legacyId * 100) + 1;
}

function nextLessonId(mod: StoredModule): string {
  const prefix = `${mod.position + 1}.`;
  const used = mod.lessons
    .filter((lesson) => lesson.id.startsWith(prefix))
    .map((lesson) => Number(lesson.id.slice(prefix.length)))
    .filter((value) => Number.isFinite(value));
  return `${prefix}${(used.length ? Math.max(...used) : 0) + 1}`;
}

async function persistModules(course: StoredCourse, modules: StoredModule[]): Promise<StoredCourse> {
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
  const updated = await getRepositories().courses.saveModules(course.legacyId, modules);
  if (!updated) throw notFound("Curso no encontrado.");
  return updated;
}

export async function addModule(
  courseId: number,
  title: string,
  user: StoredUser,
): Promise<ModuleDTO[]> {
  const course = await getRepositories().courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");

  const modules = [
    ...course.modules,
    {
      id: nextModuleId(course),
      title: title.trim(),
      position: course.modules.length,
      lessons: [],
    },
  ];
  const updated = await persistModules(course, modules);
  return buildModuleDTOs(updated);
}

export async function updateModule(
  courseId: number,
  moduleId: number,
  patch: { title?: string },
  user: StoredUser,
): Promise<ModuleDTO[]> {
  const course = await getRepositories().courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");

  const modules = course.modules.map((mod) =>
    mod.id === moduleId ? { ...mod, title: patch.title?.trim() || mod.title } : mod,
  );
  const updated = await persistModules(course, modules);
  return buildModuleDTOs(updated);
}

export async function deleteModule(
  courseId: number,
  moduleId: number,
  user: StoredUser,
): Promise<ModuleDTO[]> {
  const course = await getRepositories().courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");
  findModule(course, moduleId);

  if (course.status === "published" &&
      course.modules.every((mod) => mod.id === moduleId || mod.lessons.length === 0)) {
    throw badRequest("Un curso publicado debe conservar al menos una lección.");
  }

  const modules = course.modules
    .filter((mod) => mod.id !== moduleId)
    .map((mod, index) => ({ ...mod, position: index }));
  const updated = await persistModules(course, modules);
  return buildModuleDTOs(updated);
}

export async function reorderModules(
  courseId: number,
  ids: number[],
  user: StoredUser,
): Promise<ModuleDTO[]> {
  const course = await getRepositories().courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");
  if (ids.length !== course.modules.length || new Set(ids).size !== ids.length) {
    throw badRequest("El orden debe incluir todos los módulos del curso.");
  }

  const ordered = ids.map((id) => findModule(course, id));
  const modules = ordered.map((mod, index) => ({ ...mod, position: index }));
  const updated = await persistModules(course, modules);
  return buildModuleDTOs(updated);
}

export async function addLesson(
  courseId: number,
  moduleId: number,
  input: { title: string; type: LessonType; content?: LessonBlockDTO[]; document?: RichLessonDocument },
  user: StoredUser,
): Promise<ModuleDTO[]> {
  const course = await getRepositories().courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");
  const mod = findModule(course, moduleId);

  const lesson: StoredLesson = {
    id: nextLessonId(mod),
    title: input.title.trim(),
    type: input.type,
    position: mod.lessons.length,
    content: input.content ?? [],
    document: input.document,
  };

  const modules = course.modules.map((item) =>
    item.id === moduleId ? { ...item, lessons: [...item.lessons, lesson] } : item,
  );
  const updated = await persistModules(course, modules);
  return buildModuleDTOs(updated);
}

export async function updateLesson(
  courseId: number,
  moduleId: number,
  lessonId: string,
  patch: { title?: string; type?: LessonType; content?: LessonBlockDTO[]; document?: RichLessonDocument },
  user: StoredUser,
): Promise<ModuleDTO[]> {
  const course = await getRepositories().courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");
  const mod = findModule(course, moduleId);
  if (!mod.lessons.some((lesson) => lesson.id === lessonId)) {
    throw notFound("Lección no encontrada.");
  }

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
                }
              : lesson,
          ),
        }
      : item,
  );
  const updated = await persistModules(course, modules);
  return buildModuleDTOs(updated);
}

export async function deleteLesson(
  courseId: number,
  moduleId: number,
  lessonId: string,
  user: StoredUser,
): Promise<ModuleDTO[]> {
  const course = await getRepositories().courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");
  // Throws when the module does not exist, before any mutation.
  findModule(course, moduleId);

  if (course.status === "published" &&
      course.modules.reduce((count, item) => count + item.lessons.length, 0) === 1) {
    throw badRequest("Un curso publicado debe conservar al menos una lección.");
  }

  const modules = course.modules.map((item) =>
    item.id === moduleId
      ? {
          ...item,
          lessons: item.lessons
            .filter((lesson) => lesson.id !== lessonId)
            .map((lesson, index) => ({ ...lesson, position: index })),
        }
      : item,
  );
  const updated = await persistModules(course, modules);
  return buildModuleDTOs(updated);
}

export async function reorderLessons(
  courseId: number,
  moduleId: number,
  ids: string[],
  user: StoredUser,
): Promise<ModuleDTO[]> {
  const course = await getRepositories().courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");
  const mod = findModule(course, moduleId);
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
      ? { ...item, lessons: ordered.map((lesson, index) => ({ ...lesson, position: index })) }
      : item,
  );
  const updated = await persistModules(course, modules);
  return buildModuleDTOs(updated);
}

function buildModuleDTOs(course: StoredCourse): ModuleDTO[] {
  const statuses = moduleStatuses(course, []);
  return course.modules.map((mod) => ({
    id: mod.id,
    title: mod.title,
    status: statuses.get(mod.id) ?? "locked",
    position: mod.position,
    lessons: mod.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      done: false,
      highlight: lesson.highlight,
      position: lesson.position,
      content: lesson.content,
      document: lesson.document,
    })),
  }));
}

export async function listCourseEnrollments(courseId: number, user: StoredUser) {
  const repos = getRepositories();
  const course = await repos.courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw forbidden("No gestionás este curso.");

  const enrollments = await repos.enrollments.listAll();
  return enrollments
    .filter((enrollment) => enrollment.courseId === courseId)
    .map((enrollment) => enrollmentToDTO(enrollment, course));
}

export async function createEmptyCourseForAdmin(input: {
  title: string;
  description: string;
  priceCents: number;
  professorEmail: string;
  level?: string;
  duration?: string;
  img?: string;
  status?: "draft";
}): Promise<CourseDTO> {
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
  });
  return courseToDTO(course);
}

export function priceLabel(cents: number) {
  return formatArs(cents);
}

export function newBlockId() {
  return newId("blk");
}
