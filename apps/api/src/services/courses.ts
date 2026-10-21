import type {
  CourseDTO,
  CourseDetailDTO,
  LessonBlockDTO,
  LessonType,
  ModuleDTO,
} from "@rozenblum/shared";
import { badRequest, forbidden, notFound } from "../lib/http.js";
import { formatArs, newId } from "../lib/utils.js";
import { getRepositories } from "../repositories/index.js";
import type { CourseInput, StoredCourse, StoredLesson, StoredModule, StoredUser } from "../types.js";
import { courseStructure, courseToDTO, enrollmentToDTO, moduleStatuses } from "./mappers.js";

export function canManageCourse(course: StoredCourse, user: StoredUser): boolean {
  if (user.role === "admin") return true;
  if (user.role !== "profesor") return false;
  return (
    course.professorEmail?.toLowerCase() === user.email.toLowerCase() ||
    course.professor.toLowerCase().includes(user.name.toLowerCase())
  );
}

export async function listPublishedCourses(): Promise<CourseDTO[]> {
  const courses = await getRepositories().courses.listPublished();
  return courses.map(courseToDTO);
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
  const course = await getRepositories().courses.findBySlug(slug);
  if (!course || course.status !== "published") {
    throw notFound("Curso no encontrado.");
  }

  return {
    course: courseToDTO(course),
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
  const course = await getRepositories().courses.create(input);
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

  const updated = await repos.courses.update(courseId, patch);
  if (!updated) throw notFound("Curso no encontrado.");
  return courseToDTO(updated);
}

export async function deleteCourse(courseId: number): Promise<void> {
  const repos = getRepositories();
  const course = await repos.courses.findById(courseId);
  if (!course) throw notFound("Curso no encontrado.");
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
  if (ids.length !== course.modules.length) {
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
  input: { title: string; type: LessonType; content?: LessonBlockDTO[] },
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
  patch: { title?: string; type?: LessonType; content?: LessonBlockDTO[] },
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
  const mod = findModule(course, moduleId);

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
  if (ids.length !== mod.lessons.length) {
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
  professor: string;
  level?: string;
  duration?: string;
  img?: string;
  status?: "published" | "draft";
}): Promise<CourseDTO> {
  const course = await getRepositories().courses.create({
    title: input.title,
    description: input.description,
    priceCents: input.priceCents,
    level: input.level ?? "Inicial",
    duration: input.duration ?? "On-Demand",
    professor: input.professor,
    status: input.status ?? "draft",
    img:
      input.img ??
      "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&h=300&fit=crop&auto=format",
  });
  return courseToDTO(course);
}

export function priceLabel(cents: number) {
  return formatArs(cents);
}

export function newBlockId() {
  return newId("blk");
}
