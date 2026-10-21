import type {
  BlockType,
  CourseDTO,
  CourseSyllabusModule,
  LessonBlockDTO,
  LessonType,
  ModuleStatus,
  OrderStatus,
  Role,
} from "@rozenblum/shared";

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "Activo" | "Suspendido";
  initials: string;
  passwordHash: string;
  createdAt: string;
};

export type StoredLesson = {
  id: string;
  title: string;
  type: LessonType;
  position: number;
  highlight?: boolean;
  content: LessonBlockDTO[];
};

export type StoredModule = {
  id: number;
  title: string;
  position: number;
  lessons: StoredLesson[];
};

export type StoredCourse = {
  legacyId: number;
  slug: string;
  title: string;
  description: string;
  price: string;
  priceCents: number;
  duration: string;
  level: string;
  img: string;
  professor: string;
  professorEmail?: string;
  status: "published" | "draft";
  temario: CourseSyllabusModule[];
  modules: StoredModule[];
  createdAt: string;
  updatedAt: string;
};

export type StoredEnrollment = {
  id: string;
  studentEmail: string;
  studentName: string;
  courseId: number;
  status: "Activo" | "Pendiente" | "Completado" | "Revocado";
  startedAt: string;
  completedLessonIds: string[];
};

export type StoredOrder = {
  id: string;
  externalReference: string;
  alumno: string;
  email: string;
  curso: string;
  courseSlug: string;
  courseId: number;
  monto: string;
  montoCents: number;
  fecha: string;
  metodo: string;
  estado: OrderStatus;
  createdAt: string;
};

export type StoredMessage = {
  id: string;
  from: "me" | "prof";
  text: string;
  time: string;
  createdAt: string;
};

export type StoredConversation = {
  id: string;
  courseId: number;
  studentEmail: string;
  studentName: string;
  teacherEmail: string;
  teacherName: string;
  messages: StoredMessage[];
};

export type StoredSettings = {
  companyName: string;
  supportEmail: string;
  logoUrl: string;
  privacyText: string;
  updatedAt: string;
};

export type StoredContact = {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
};

/** Presentation shape sent to the classroom / course editor. */
export type CourseStructure = {
  course: CourseDTO;
  modules: {
    id: number;
    title: string;
    status: ModuleStatus;
    position: number;
    lessons: {
      id: string;
      title: string;
      type: LessonType;
      done: boolean;
      highlight?: boolean;
      position: number;
      content?: LessonBlockDTO[];
    }[];
  }[];
};

export type LessonContent = {
  id: string;
  type: BlockType;
  content: string;
  items?: string[];
  expanded?: boolean;
  toggleContent?: string;
};

export type CourseInput = {
  title: string;
  description: string;
  priceCents: number;
  duration: string;
  level: string;
  professor: string;
  status: "published" | "draft";
  img: string;
};
