import type { CourseModuleView, ChatMessage } from "../types";

export const MODULES: CourseModuleView[] = [
  {
    id: 1,
    title: "Módulo 1: Introducción",
    status: "completed",
    lessons: [
      { id: "1.1", title: "¿Qué es el derecho penal?", type: "video", done: true },
      { id: "1.2", title: "Conceptos básicos", type: "pdf", done: true },
    ],
  },
  {
    id: 2,
    title: "Módulo 2: Delitos contra la propiedad",
    status: "in_progress",
    lessons: [
      { id: "2.1", title: "Introducción al módulo", type: "video", done: true },
      { id: "2.2", title: "Delitos contra la propiedad", type: "ppt", done: false, highlight: true },
    ],
  },
  {
    id: 3,
    title: "Módulo 3: Delitos contra las personas",
    status: "locked",
    lessons: [],
  },
  {
    id: 4,
    title: "Módulo 4: Proceso penal",
    status: "locked",
    lessons: [],
  },
];

export const MESSAGES: ChatMessage[] = [
  { id: "1", from: "prof", text: "Hola Juan, recuerda que el material del módulo 2 incluye casos prácticos. ¡Cualquier consulta no dudes en escribirme!", time: "Prof. Rozenblum · 14:32" },
  { id: "2", from: "me", text: "Muchas gracias! Tengo una duda sobre la lección 2.2, ¿puedo enviarle el ejercicio para revisión?", time: "Tú · 15:10" },
  { id: "3", from: "prof", text: "Por supuesto, podés subir el ejercicio al foro del módulo. Lo reviso esta tarde.", time: "Prof. Rozenblum · 15:45" },
];
