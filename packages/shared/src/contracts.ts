import { z } from "zod";

/* ──────────────────────────────────────────────────────────────────────────────
 * Roles & session
 * ────────────────────────────────────────────────────────────────────────────*/

export const ROLES = ["alumno", "profesor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const roleSchema = z.enum(ROLES);

export type UserDTO = {
  id: string;
  name: string;
  email: string;
  role: Role;
  initials: string;
  status: "Activo" | "Suspendido";
};

export type SessionDTO = {
  token: string;
  user: UserDTO;
};

export type LoginInput = {
  role: Role;
  email: string;
  password: string;
};

export const loginSchema = z.object({
  role: roleSchema,
  email: z.string().trim().email(),
  password: z.string().min(1),
});

/* ──────────────────────────────────────────────────────────────────────────────
 * Courses
 * ────────────────────────────────────────────────────────────────────────────*/

export const LESSON_TYPES = ["video", "pdf", "ppt", "doc"] as const;
export type LessonType = (typeof LESSON_TYPES)[number];

export const MODULE_STATUSES = ["locked", "in_progress", "completed"] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

export type CourseSyllabusModule = {
  mod: number;
  title: string;
  lessons: string[];
};

export type CourseDTO = {
  id: number;
  slug: string;
  title: string;
  description: string;
  /** Display string preserved from the Figma prototype, e.g. "$40.000". */
  price: string;
  /** Canonical amount in ARS cents; source of truth for payments. */
  priceCents: number;
  modules: number;
  duration: string;
  level: string;
  img: string;
  professor: string;
  professorId?: string;
  status: "published" | "draft";
  temario: CourseSyllabusModule[];
};

export type LessonDTO = {
  id: string;
  title: string;
  type: LessonType;
  done: boolean;
  highlight?: boolean;
  position: number;
  content?: LessonBlockDTO[];
};

export type ModuleDTO = {
  id: number;
  title: string;
  status: ModuleStatus;
  position: number;
  lessons: LessonDTO[];
};

export type EnrollmentDTO = {
  id: string;
  courseId: number;
  courseSlug: string;
  courseTitle: string;
  courseImg: string;
  courseProfessor: string;
  studentName: string;
  progress: number;
  status: "Activo" | "Pendiente" | "Completado" | "Revocado";
  modules: ModuleDTO[];
};

export type ProgressInput = {
  lessonId: string;
  completed: boolean;
};

export const progressSchema = z.object({
  lessonId: z.string().min(1),
  completed: z.boolean(),
});

/* ──────────────────────────────────────────────────────────────────────────────
 * Lesson content (BlockNotes)
 * ────────────────────────────────────────────────────────────────────────────*/

export const BLOCK_TYPES = [
  "h1",
  "h2",
  "h3",
  "paragraph",
  "bullet",
  "numbered",
  "quote",
  "toggle",
  "link",
  "code",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export type LessonBlockDTO = {
  id: string;
  type: BlockType;
  content: string;
  items?: string[];
  expanded?: boolean;
  toggleContent?: string;
};

export const lessonBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(BLOCK_TYPES),
  content: z.string(),
  items: z.array(z.string()).optional(),
  expanded: z.boolean().optional(),
  toggleContent: z.string().optional(),
});

export const lessonPayloadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  type: z.enum(LESSON_TYPES),
  content: z.array(lessonBlockSchema).optional(),
});

/* ──────────────────────────────────────────────────────────────────────────────
 * Modules / course authoring
 * ────────────────────────────────────────────────────────────────────────────*/

export const modulePayloadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  courseId: z.number().int().positive(),
});

export const reorderSchema = z.object({
  ids: z.array(z.union([z.string(), z.number()])).min(1),
});

export const coursePayloadSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(2000),
  priceCents: z.number().int().nonnegative(),
  level: z.string().trim().min(1).max(60),
  duration: z.string().trim().min(1).max(60),
  professor: z.string().trim().min(1).max(120),
  status: z.enum(["published", "draft"]).default("draft"),
  img: z.string().trim().url().optional(),
});

/* ──────────────────────────────────────────────────────────────────────────────
 * Orders / checkout
 * ────────────────────────────────────────────────────────────────────────────*/

export const ORDER_STATUSES = ["Pagado", "Pendiente", "Rechazado", "Reembolsado"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderDTO = {
  id: string;
  alumno: string;
  curso: string;
  monto: string;
  fecha: string;
  metodo: string;
  estado: OrderStatus;
  courseSlug?: string;
  externalReference?: string;
};

export const checkoutSchema = z.object({
  courseSlug: z.string().min(1),
  nombre: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
  dni: z.string().trim().min(5).max(20),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export type CheckoutResultDTO = {
  order: OrderDTO;
  enrollment: EnrollmentDTO | null;
  message: string;
};

/* ──────────────────────────────────────────────────────────────────────────────
 * Messaging & notifications
 * ────────────────────────────────────────────────────────────────────────────*/

export type ChatMessageDTO = {
  id: string;
  from: "me" | "prof";
  text: string;
  time: string;
};

export const messagePayloadSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export type SiteSettingsDTO = {
  companyName: string;
  supportEmail: string;
  contactWhatsapp: string;
  logoUrl: string;
  privacyText: string;
  paymentProvider: "mercadopago";
  /** Computed on the API from env; secrets are never returned. */
  paymentsConfigured: boolean;
};

export type HomeContentDTO = {
  key: "home";
  team: { name: string; role: string; img: string }[];
  practiceAreas: {
    title: string;
    desc: string;
    icon: "briefcase" | "family" | "shield" | "doc" | "building";
    casos: { q: string; a: string }[];
  }[];
};

export const siteSettingsSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  supportEmail: z.string().trim().email(),
  contactWhatsapp: z.string().trim().regex(/^\d{8,18}$/),
  logoUrl: z.string().trim().max(500),
  privacyText: z.string().trim().min(10).max(10000),
});

export const contactSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
  message: z.string().trim().min(10).max(2000),
});

export type ContactInput = z.infer<typeof contactSchema>;

export type AdminOverviewDTO = {
  dashboard: AdminDashboardDTO;
  alumnos: AdminAlumnoDTO[];
  profesores: AdminProfesorDTO[];
  cursos: AdminCursoDTO[];
  orders: OrderDTO[];
  inscripciones: AdminInscripcionDTO[];
  reportes: AdminReportesDTO;
  settings: SiteSettingsDTO;
};

export type AdminUserInput = {
  role: "alumno" | "profesor";
  name: string;
  email: string;
  password: string;
};

export const adminUserSchema = z.object({
  role: z.enum(["alumno", "profesor"]),
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
  password: z.string().min(12).max(128),
});

export const adminUserPatchSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  email: z.string().trim().email().optional(),
  status: z.enum(["Activo", "Suspendido"]).optional(),
  password: z.string().min(12).max(128).optional(),
});

export const adminCoursePatchSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().min(3).max(2000).optional(),
  professor: z.string().trim().min(1).max(120).optional(),
  priceCents: z.number().int().nonnegative().optional(),
  status: z.enum(["published", "draft"]).optional(),
  img: z.string().trim().url().optional(),
});

export const orderStatusSchema = z.object({
  estado: z.enum(ORDER_STATUSES),
});

export type ConversationDTO = {
  id: string;
  courseId: number;
  courseTitle: string;
  peerName: string;
  peerEmail: string;
  messages: ChatMessageDTO[];
};

export type NotificationDTO = {
  id: string;
  icon: string;
  text: string;
  time: string;
  read: boolean;
};

/* ──────────────────────────────────────────────────────────────────────────────
 * Teacher & admin views
 * ────────────────────────────────────────────────────────────────────────────*/

export type TeacherStudentDTO = {
  id: string;
  name: string;
  email: string;
  progress: number;
  last: string;
  msgs: number;
};

export type TeacherCourseDTO = {
  id: number;
  slug: string;
  title: string;
  students: number;
  completion: number;
  img: string;
  status: "published" | "draft";
};

export type TeacherNotificationDTO = {
  id: string;
  icon: string;
  text: string;
  time: string;
};

export type TeacherDashboardDTO = {
  activeStudents: number;
  averageProgress: number;
  newEnrollments: number;
  unreadMessages: number;
  courses: TeacherCourseDTO[];
  notifications: TeacherNotificationDTO[];
};

export type CourseDetailDTO = {
  course: CourseDTO;
  modules: ModuleDTO[];
};

export type AdminAlumnoDTO = {
  id: string;
  name: string;
  email: string;
  cursos: number;
  progress: number;
  fecha: string;
  estado: "Activo" | "Suspendido";
};

export type AdminProfesorDTO = {
  id: string;
  name: string;
  email: string;
  cursos: number;
  alumnos: number;
  estado: "Activo" | "Suspendido";
};

export type AdminCursoDTO = {
  id: number;
  slug: string;
  name: string;
  profesor: string;
  alumnos: number;
  completion: number;
  estado: "Publicado" | "Borrador";
};

export type AdminInscripcionDTO = {
  id: string;
  alumno: string;
  curso: string;
  fecha: string;
  docente: string;
  estado: string;
};

export type MonthlySeriesDTO = { month: string; value: number };

export type AdminReportesDTO = {
  ingresosPorMes: MonthlySeriesDTO[];
  alumnosPorMes: MonthlySeriesDTO[];
  completionPorCurso: { name: string; pct: number }[];
  cursosPopulares: { name: string; count: number; color: string }[];
};

export type AdminDashboardDTO = {
  totalIngresos: string;
  alumnosActivos: number;
  cursosPublicados: number;
  cursosBorrador: number;
  nuevasInscripciones: number;
  ingresosTrend: string;
  alumnosTrend: string;
  reportes: AdminReportesDTO;
  orders: OrderDTO[];
  inscripciones: AdminInscripcionDTO[];
};

/* ──────────────────────────────────────────────────────────────────────────────
 * HTTP envelope
 * ────────────────────────────────────────────────────────────────────────────*/

export type ApiSuccess<T> = { data: T };
export type ApiFailure = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
