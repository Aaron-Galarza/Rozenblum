import type { ProfesorStudent, ProfesorNotification, ProfesorCourse, EditableModule } from "../types";

export const STUDENTS: ProfesorStudent[] = [
  { name: "Juan García", email: "juan@email.com", progress: 85, last: "Hace 2 horas", msgs: 0 },
  { name: "María López", email: "maria@email.com", progress: 45, last: "Hace 5 días", msgs: 1 },
  { name: "Carlos Pérez", email: "carlos@email.com", progress: 70, last: "Ayer", msgs: 0 },
  { name: "Laura Martínez", email: "laura@email.com", progress: 30, last: "Hace 1 semana", msgs: 2 },
  { name: "Andrés Rivero", email: "andres@email.com", progress: 90, last: "Hace 3 horas", msgs: 0 },
];

export const NOTIFICATIONS: ProfesorNotification[] = [
  { icon: "🔔", text: "Nuevo alumno inscrito: Carlos Martínez", time: "14:30" },
  { icon: "✉️", text: "Nuevo mensaje de María López", time: "12:15" },
  { icon: "✓", text: "Juan García completó el módulo 1", time: "09:45" },
  { icon: "🔔", text: "Nueva inscripción: Sofía Ramírez", time: "08:20" },
];

export const COURSES: ProfesorCourse[] = [
  { id: 1, title: "Derecho Penal Básico", students: 12, completion: 65, img: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=200&h=120&fit=crop&auto=format" },
  { id: 2, title: "Derecho Laboral Práctico", students: 8, completion: 48, img: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=200&h=120&fit=crop&auto=format" },
  { id: 3, title: "Litigación Oral", students: 5, completion: 22, img: "https://images.unsplash.com/photo-1521791055366-0d553872952f?w=200&h=120&fit=crop&auto=format" },
];

export const MODULES_EDITABLE: EditableModule[] = [
  { id: 1, title: "Introducción", lessons: [{ title: "Video: ¿Qué es el derecho penal?", type: "video" }, { title: "PDF: Conceptos básicos", type: "pdf" }] },
  { id: 2, title: "Delitos contra la propiedad", lessons: [{ title: "Video: Introducción al módulo", type: "video" }, { title: "PPT: Delitos contra la propiedad", type: "ppt" }] },
];
