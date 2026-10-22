import type { AdminSection } from "../../types";

export const NAV_ITEMS: { key: AdminSection; label: string; emoji: string }[] = [
  { key: "dashboard", label: "Dashboard", emoji: "📊" },
  { key: "profesores", label: "Profesores", emoji: "👨‍🏫" },
  { key: "alumnos", label: "Alumnos", emoji: "👨‍🎓" },
  { key: "cursos", label: "Cursos", emoji: "📚" },
  { key: "pagos", label: "Pagos / Órdenes", emoji: "💳" },
  { key: "consultas", label: "Consultas", emoji: "✉️" },
  { key: "reportes", label: "Reportes", emoji: "📈" },
  { key: "config", label: "Configuración", emoji: "⚙️" },
];
