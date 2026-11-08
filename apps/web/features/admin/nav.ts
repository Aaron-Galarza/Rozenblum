import type { AdminSection } from "../../types";

export const NAV_ITEMS: { key: AdminSection; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "profesores", label: "Profesores" },
  { key: "alumnos", label: "Alumnos" },
  { key: "cursos", label: "Cursos" },
  { key: "pagos", label: "Pagos / Órdenes" },
  { key: "consultas", label: "Consultas" },
  { key: "reportes", label: "Reportes" },
];
