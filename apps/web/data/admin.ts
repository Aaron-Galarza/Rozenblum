import type { Order, Inscripcion, Profesor, Alumno, CursoAdmin, AdminSection } from "../types";

export const NAV_ITEMS: { key: AdminSection; label: string; emoji: string }[] = [
  { key: "dashboard", label: "Dashboard", emoji: "📊" },
  { key: "profesores", label: "Profesores", emoji: "👨‍🏫" },
  { key: "alumnos", label: "Alumnos", emoji: "👨‍🎓" },
  { key: "cursos", label: "Cursos", emoji: "📚" },
  { key: "pagos", label: "Pagos / Órdenes", emoji: "💳" },
  { key: "reportes", label: "Reportes", emoji: "📈" },
  { key: "config", label: "Configuración", emoji: "⚙️" },
];

export const ORDERS: Order[] = [
  { id: "ORD-001", alumno: "Juan García", curso: "Derecho Penal Básico", monto: "$40.000", fecha: "27/08", metodo: "MercadoPago", estado: "Pagado" },
  { id: "ORD-002", alumno: "María López", curso: "Derecho Laboral Práctico", monto: "$35.000", fecha: "26/08", metodo: "MercadoPago", estado: "Pagado" },
  { id: "ORD-003", alumno: "Carlos Pérez", curso: "Litigación Oral", monto: "$42.000", fecha: "25/08", metodo: "MercadoPago", estado: "Pagado" },
];

export const INSCRIPCIONES: Inscripcion[] = [
  { alumno: "Carlos Pérez", curso: "Derecho Penal Básico", fecha: "27/08", docente: "Karin Rozenblum", estado: "Activo" },
  { alumno: "Laura Martínez", curso: "Derecho Laboral Práctico", fecha: "26/08", docente: "Martín Salas", estado: "Activo" },
  { alumno: "Sofía Ramírez", curso: "Actualización en Derecho de Familia", fecha: "25/08", docente: "Valentina Cruz", estado: "Activo" },
];

export const PROFESORES: Profesor[] = [
  { name: "Karin Rozenblum", email: "profesor@rozenblum.com", cursos: 2, alumnos: 87, estado: "Activo" },
  { name: "Martín Salas", email: "martin@rozenblum.com", cursos: 1, alumnos: 65, estado: "Activo" },
  { name: "Valentina Cruz", email: "valentina@rozenblum.com", cursos: 1, alumnos: 34, estado: "Activo" },
  { name: "Hernán Vidal", email: "hernan@rozenblum.com", cursos: 2, alumnos: 12, estado: "Activo" },
];

export const ALUMNOS: Alumno[] = [
  { name: "Juan García", email: "alumno@rozenblum.com", cursos: 2, progress: 85, fecha: "15/08", estado: "Activo" },
  { name: "María López", email: "maria@email.com", cursos: 1, progress: 45, fecha: "20/08", estado: "Activo" },
  { name: "Carlos Pérez", email: "carlos@email.com", cursos: 3, progress: 70, fecha: "22/08", estado: "Activo" },
  { name: "Laura Martínez", email: "laura@email.com", cursos: 1, progress: 30, fecha: "25/08", estado: "Activo" },
  { name: "Andrés Rivero", email: "andres@email.com", cursos: 1, progress: 90, fecha: "02/09", estado: "Activo" },
];

export const CURSOS_ADMIN: CursoAdmin[] = [
  { name: "Derecho Penal Básico", profesor: "Karin Rozenblum", alumnos: 45, completion: 65, estado: "Publicado" },
  { name: "Derecho Laboral Práctico", profesor: "Martín Salas", alumnos: 32, completion: 55, estado: "Publicado" },
  { name: "Actualización en Derecho de Familia", profesor: "Valentina Cruz", alumnos: 18, completion: 40, estado: "Borrador" },
];
