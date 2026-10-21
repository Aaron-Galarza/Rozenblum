"use client";

import type { ProfesorCourse } from "../../types";

type ProfesorDashboardProps = {
  courses: ProfesorCourse[];
  stats: {
    activeStudents: number;
    averageProgress: number;
    newEnrollments: number;
    unreadMessages: number;
  };
  onOpenCourse: (courseId: number) => void;
};

export default function ProfesorDashboard({ courses, stats, onOpenCourse }: ProfesorDashboardProps) {
  return (
    <>
      <h2 className="text-3xl font-light mb-8" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Mi Dashboard</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        {[
          { label: "Alumnos Activos", value: String(stats.activeStudents), sub: "Total de estudiantes inscritos" },
          { label: "Progreso Promedio", value: `${stats.averageProgress}%`, sub: "Completion rate de alumnos", bar: true },
          { label: "Nuevas Inscripciones", value: String(stats.newEnrollments), sub: "Últimos 7 días" },
          { label: "Mensajes sin Leer", value: String(stats.unreadMessages), sub: "De tus alumnos" },
        ].map(({ label, value, sub, bar }) => (
          <div key={label} className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
            <p className="text-4xl font-light mb-1" style={{ color: "#B58A43", fontFamily: "'Cormorant Garamond', serif" }}>{value}</p>
            <p className="text-xs font-bold mb-1" style={{ color: "#173B6C" }}>{label}</p>
            <p className="text-xs" style={{ color: "rgba(23,59,108,0.5)" }}>{sub}</p>
            {bar && (
              <div className="mt-3 w-full h-1.5 rounded-full" style={{ backgroundColor: "#E0E0E0" }}>
                <div className="h-1.5 rounded-full" style={{ width: `${stats.averageProgress}%`, backgroundColor: "#B58A43" }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Course grid */}
      <h3 className="text-xl font-medium mb-5" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Mis Cursos</h3>
      <div className="grid sm:grid-cols-3 gap-5">
        {courses.map((c) => (
          <div key={c.id} className="rounded-lg overflow-hidden shadow-sm" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
            <img src={c.img} alt={c.title} className="w-full object-cover" style={{ height: 120 }} />
            <div className="p-4">
              <h4 className="text-base font-semibold" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{c.title}</h4>
              <p className="text-xs mt-1" style={{ color: "rgba(23,59,108,0.55)" }}>{c.students} alumnos · {c.completion}% completado</p>
              <button onClick={() => onOpenCourse(c.id)} className="mt-4 w-full py-2 text-xs font-bold tracking-widest hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>
                ABRIR CURSO
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
