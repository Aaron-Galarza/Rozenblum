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
  { id: "ORD-001", alumno: "Juan García", curso: "Derecho Penal", monto: "$2.500", fecha: "27/08", metodo: "Stripe", estado: "Pagado" },
  { id: "ORD-002", alumno: "María López", curso: "Laboral", monto: "$2.500", fecha: "26/08", metodo: "MercadoPago", estado: "Pagado" },
  { id: "ORD-003", alumno: "Carlos Pérez", curso: "Derecho Civil", monto: "$2.500", fecha: "25/08", metodo: "Stripe", estado: "Pagado" },
];

export const INSCRIPCIONES: Inscripcion[] = [
  { alumno: "Carlos Pérez", curso: "Penal Básico", fecha: "27/08", docente: "Karin R.", estado: "Activo" },
  { alumno: "Laura García", curso: "Laboral", fecha: "26/08", docente: "Miguel S.", estado: "Activo" },
  { alumno: "Sofía Ramírez", curso: "Familia", fecha: "25/08", docente: "Valentina C.", estado: "Activo" },
];

export const PROFESORES: Profesor[] = [
  { name: "Karin Rozenblum", email: "karin@estudio.com", cursos: 3, alumnos: 87, estado: "Activo" },
  { name: "Miguel Santos", email: "miguel@estudio.com", cursos: 2, alumnos: 65, estado: "Activo" },
  { name: "Valentina Cruz", email: "valentina@estudio.com", cursos: 1, alumnos: 34, estado: "Activo" },
];

export const ALUMNOS: Alumno[] = [
  { name: "Juan García", email: "juan@email.com", cursos: 2, progress: 85, fecha: "15/08", estado: "Activo" },
  { name: "María López", email: "maria@email.com", cursos: 1, progress: 45, fecha: "20/08", estado: "Activo" },
  { name: "Carlos Pérez", email: "carlos@email.com", cursos: 3, progress: 70, fecha: "22/08", estado: "Activo" },
  { name: "Laura Martínez", email: "laura@email.com", cursos: 1, progress: 30, fecha: "25/08", estado: "Activo" },
];

export const CURSOS_ADMIN: CursoAdmin[] = [
  { name: "Derecho Penal Básico", profesor: "Karin R.", alumnos: 45, completion: 65, estado: "Publicado" },
  { name: "Derecho Laboral", profesor: "Miguel S.", alumnos: 32, completion: 55, estado: "Publicado" },
  { name: "Actualización en Familia", profesor: "Valentina C.", alumnos: 18, completion: 40, estado: "Borrador" },
];
