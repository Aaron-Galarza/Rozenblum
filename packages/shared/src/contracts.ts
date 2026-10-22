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
  document?: RichLessonDocument;
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

/** Versioned BlockNote JSON. Existing lessons keep their legacy `content` blocks. */
export type RichLessonDocument = {
  version: 1;
  blocks: Record<string, unknown>[];
};

const safeDocumentUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

export const richLessonDocumentSchema = z.object({
  version: z.literal(1),
  blocks: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
}).superRefine((document, ctx) => {
  const allowedBlocks = new Set(["paragraph", "heading", "quote", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "codeBlock", "table", "file", "image", "video", "audio", "youtube", "bookmark"]);
  const serialized = JSON.stringify(document);
  if (serialized.length > 250_000) {
    ctx.addIssue({ code: "custom", message: "El documento supera el tamaño permitido." });
  }
  let count = 0;
  const visit = (value: unknown, depth: number): void => {
    if (depth > 20) {
      ctx.addIssue({ code: "custom", message: "El documento tiene demasiados niveles." });
      return;
    }
    if (typeof value === "string" && value.length > 20_000) {
      ctx.addIssue({ code: "custom", message: "Hay texto demasiado largo en el documento." });
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      if (value.length > 1000) ctx.addIssue({ code: "custom", message: "El documento contiene demasiados elementos." });
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      count += 1;
      if (count > 20_000) {
        ctx.addIssue({ code: "custom", message: "El documento contiene demasiados elementos." });
        return;
      }
      if (key.startsWith("$") || key.includes(".") || key === "__proto__" || key === "constructor" || key === "prototype") {
        ctx.addIssue({ code: "custom", message: "El documento contiene una propiedad inválida." });
      }
      if ((key === "href" || key === "url") && typeof item === "string" && item && !safeDocumentUrl(item)) {
        ctx.addIssue({ code: "custom", message: "Los enlaces deben usar http o https." });
      }
      visit(item, depth + 1);
    }
  };
  const checkBlocks = (blocks: Record<string, unknown>[], depth = 0) => {
    if (depth > 20) return;
    for (const block of blocks) {
      if (!block || typeof block !== "object" || typeof block.id !== "string" || block.id.length > 100 || !allowedBlocks.has(String(block.type))) {
        ctx.addIssue({ code: "custom", message: "El documento contiene un bloque inválido." });
        continue;
      }
      if (Array.isArray(block.children)) checkBlocks(block.children as Record<string, unknown>[], depth + 1);
    }
  };
  checkBlocks(document.blocks);
  visit(document.blocks, 0);
});

export const lessonBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(BLOCK_TYPES),
  content: z.string(),
  items: z.array(z.string()).optional(),
  expanded: z.boolean().optional(),
  toggleContent: z.string().optional(),
}).superRefine((block, ctx) => {
  if (block.type !== "link") return;
  try {
    const url = new URL(block.content);
    if (url.protocol === "http:" || url.protocol === "https:") return;
  } catch {
    // An invalid or relative URL cannot be used as a lesson link.
  }
  ctx.addIssue({ code: "custom", path: ["content"], message: "El enlace debe usar http o https." });
});

export const lessonPayloadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  type: z.enum(LESSON_TYPES),
  content: z.array(lessonBlockSchema).optional(),
  document: richLessonDocumentSchema.optional(),
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
  password: z.string().min(12).max(128),
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
  brand: {
    locationLabel: string;
    foundedYear: string;
    heroImage: string;
    metrics: { value: string; label: string }[];
    aboutParagraphs: string[];
    footerTagline: string;
  };
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
  duration: z.string().trim().min(1).max(60).optional(),
  level: z.string().trim().min(1).max(60).optional(),
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
