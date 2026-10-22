"use client";

import { useRouter } from "next/navigation";
import type { CourseModuleView, Lesson } from "../../types";
import { TypeIcon } from "../../components/icons";

type ModuleSidebarProps = {
  modules: CourseModuleView[];
  expandedModules: number[];
  selectedLesson: Lesson;
  onToggleModule: (id: number) => void;
  onSelectLesson: (lesson: Lesson) => void;
  courseTitle: string;
  courseImg: string;
  progress: number;
  statusLabel: string;
  courses?: { id: number; title: string }[];
  onSelectCourse?: (id: number) => void;
};

export default function ModuleSidebar({
  modules,
  expandedModules,
  selectedLesson,
  onToggleModule,
  onSelectLesson,
  courseTitle,
  courseImg,
  progress,
  statusLabel,
  courses,
  onSelectCourse,
}: ModuleSidebarProps) {
  const router = useRouter();

  return (
    <aside className="w-72 flex-shrink-0 overflow-y-auto" style={{ backgroundColor: "#FFFFFF", borderRight: "1px solid #E0E0E0" }}>
      <div className="p-4">
        <button
          onClick={() => router.push("/catalogo")}
          className="text-xs font-medium underline underline-offset-2 hover:opacity-60 transition-opacity mb-4 flex items-center gap-1.5"
          style={{ color: "#173B6C" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          Ver catálogo
        </button>

        {courses && courses.length > 1 && onSelectCourse && (
          <div className="mb-4">
            <label className="text-[10px] font-bold tracking-widest uppercase mb-1 block" style={{ color: "#B58A43" }}>
              Mis cursos
            </label>
            <select
              value={courses.find((course) => course.title === courseTitle)?.id ?? ""}
              onChange={(e) => onSelectCourse(Number(e.target.value))}
              className="w-full px-2 py-2 text-xs outline-none bg-white"
              style={{ border: "1px solid rgba(23,59,108,0.2)", borderRadius: 4, color: "#173B6C" }}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.title}</option>
              ))}
            </select>
          </div>
        )}

        {/* Course thumbnail */}
        <div className="rounded p-3 mb-4" style={{ backgroundColor: "#F5F5F5", borderLeft: "4px solid #B58A43" }}>
          <div className="w-full h-24 rounded mb-2 overflow-hidden" style={{ backgroundColor: "#D0D0D0" }}>
            {courseImg && (
              <img src={courseImg} alt={courseTitle} className="w-full h-full object-cover" />
            )}
          </div>
          <p className="text-sm font-semibold" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{courseTitle}</p>
          <div className="mt-2">
            <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: "#E0E0E0" }}>
              <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: "#B58A43" }} />
            </div>
            <p className="text-xs mt-1" style={{ color: "#173B6C", opacity: 0.65 }}>{progress}% completado</p>
          </div>
          <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-bold tracking-widest" style={{ color: "#B58A43", backgroundColor: "#173B6C" }}>{statusLabel}</span>
        </div>

        {/* Module index */}
        <p className="text-[10px] font-bold tracking-widest uppercase mb-3 px-1" style={{ color: "#B58A43" }}>Índice del Curso</p>
        <div className="space-y-1">
          {modules.map((mod) => (
            <div key={mod.id}>
              <button
                onClick={() => mod.status !== "locked" && onToggleModule(mod.id)}
                disabled={mod.status === "locked"}
                className="w-full text-left flex items-center justify-between px-2 py-2 rounded text-xs font-bold transition-colors"
                style={{ color: mod.status === "locked" ? "rgba(23,59,108,0.35)" : "#173B6C" }}
              >
                <span className="flex items-center gap-2">
                  {mod.status === "completed" && <span style={{ color: "#22c55e" }}>✓</span>}
                  {mod.status === "in_progress" && <span style={{ color: "#B58A43" }}>●</span>}
                  {mod.status === "locked" && <span style={{ color: "rgba(23,59,108,0.3)" }}>🔒</span>}
                  <span className="leading-tight">{mod.title}</span>
                </span>
                {mod.status !== "locked" && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-3.5 h-3.5 transition-transform ${expandedModules.includes(mod.id) ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                )}
              </button>
              {mod.status === "locked" && (
                <p className="px-2 pb-2 text-[10px]" style={{ color: "rgba(23,59,108,0.45)" }}>Completa los módulos anteriores</p>
              )}
              {expandedModules.includes(mod.id) && mod.lessons.map((lesson) => (
                <button
                  key={lesson.id}
                  onClick={() => onSelectLesson(lesson)}
                  className="w-full text-left flex items-center gap-2 pl-6 pr-2 py-1.5 text-xs rounded transition-colors"
                  style={{
                    backgroundColor: lesson.highlight ? "#FFF9E6" : selectedLesson.id === lesson.id ? "rgba(181,138,67,0.1)" : "transparent",
                    color: "#173B6C",
                  }}
                >
                  {lesson.done
                    ? <span className="text-[10px]" style={{ color: "#22c55e" }}>✓</span>
                    : <span className="w-3 h-3 rounded-full border flex-shrink-0" style={{ borderColor: "rgba(23,59,108,0.3)" }} />}
                  <TypeIcon type={lesson.type} />
                  <span className="leading-tight">{lesson.id}: {lesson.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
