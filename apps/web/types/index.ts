// ── Shared TypeScript types ────────────────────────────────────────────────────
import type { ReactNode } from "react";
import type { LessonBlockDTO } from "@rozenblum/shared";

export type CourseModule = {
  mod: number;
  title: string;
  lessons: string[];
};

export type Course = {
  id: number;
  slug?: string;
  title: string;
  description: string;
  price: string;
  priceCents?: number;
  modules: number;
  duration: string;
  level: string;
  img: string;
  professor: string;
  temario: CourseModule[];
};

export type DetailTab = "descripcion" | "temario" | "docente";

export type TeamMember = {
  name: string;
  role: string;
  img: string;
};

export type PracticeAreaCase = {
  q: string;
  a: string;
};

export type PracticeArea = {
  title: string;
  desc: string;
  icon: ReactNode;
  casos: PracticeAreaCase[];
};

export type Lesson = {
  id: string;
  title: string;
  type: string;
  done: boolean;
  highlight?: boolean;
  content?: LessonBlockDTO[];
};

export type CourseModuleView = {
  id: number;
  title: string;
  status: string;
  lessons: Lesson[];
};

export type ChatMessage = {
  id: string;
  from: string;
  text: string;
  time: string;
};

export type ProfesorStudent = {
  name: string;
  email: string;
  progress: number;
  last: string;
  msgs: number;
};

export type ProfesorNotification = {
  icon: string;
  text: string;
  time: string;
};

export type ProfesorCourse = {
  id: number;
  title: string;
  students: number;
  completion: number;
  img: string;
};

export type EditableLesson = {
  id?: string;
  title: string;
  type: string;
  content?: import("@rozenblum/shared").LessonBlockDTO[];
};

export type EditableModule = {
  id: number;
  title: string;
  lessons: EditableLesson[];
};

export type ProfesorTab = "dashboard" | "course";
export type SortDir = "asc" | "desc";

export type AdminSection = "dashboard" | "profesores" | "alumnos" | "cursos" | "pagos" | "reportes" | "config";

export type Order = {
  id: string;
  alumno: string;
  curso: string;
  monto: string;
  fecha: string;
  metodo: string;
  estado: string;
};

export type Inscripcion = {
  alumno: string;
  curso: string;
  fecha: string;
  docente: string;
  estado: string;
};

export type Profesor = {
  name: string;
  email: string;
  cursos: number;
  alumnos: number;
  estado: string;
};

export type Alumno = {
  name: string;
  email: string;
  cursos: number;
  progress: number;
  fecha: string;
  estado: string;
};

export type CursoAdmin = {
  name: string;
  profesor: string;
  alumnos: number;
  completion: number;
  estado: string;
};
