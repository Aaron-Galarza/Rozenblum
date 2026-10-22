"use client";

import { useEffect, useState } from "react";
import type { HomeContentDTO } from "@rozenblum/shared";
import type { Course, DetailTab } from "../../types";
import { apiFetch } from "../../lib/api";

type CourseDetailProps = {
  course: Course;
  onBack: () => void;
  onBuy: () => void;
};

export default function CourseDetail({ course, onBack, onBuy }: CourseDetailProps) {
  const [tab, setTab] = useState<DetailTab>("descripcion");
  const [expandedMods, setExpandedMods] = useState<number[]>([1]);
  const [homeContent, setHomeContent] = useState<HomeContentDTO | null>(null);

  useEffect(() => {
    apiFetch<HomeContentDTO>("/api/content/home").then(setHomeContent).catch(() => setHomeContent(null));
  }, []);
  const teacher = homeContent?.team.find((member) => member.name === course.professor);

  const toggleMod = (id: number) =>
    setExpandedMods((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="max-w-6xl mx-auto px-6 py-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs hover:opacity-60 transition-opacity" style={{ color: "#173B6C" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          Volver al catálogo
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-20 grid lg:grid-cols-[1fr_360px] gap-12 items-start">
        {/* ── Left column ── */}
        <div>
          {/* Course cover */}
          <div
            className="w-full flex items-center justify-center mb-8 rounded-lg overflow-hidden"
            style={{ aspectRatio: "16/9", backgroundColor: "#0f172a", position: "relative" }}
          >
            <img src={course.img} alt={course.title} className="absolute inset-0 w-full h-full object-cover opacity-40" />
          </div>

          <h1 className="text-4xl lg:text-5xl font-light mb-2" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>
            {course.title}
          </h1>
          <p className="text-sm mb-8" style={{ color: "rgba(23,59,108,0.65)" }}>Por {course.professor}</p>

          {/* Tabs */}
          <div className="flex" style={{ borderBottom: "2px solid rgba(23,59,108,0.1)" }}>
            {(["descripcion", "temario", "docente"] as DetailTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-6 py-3 text-xs font-medium tracking-widest uppercase transition-all"
                style={{
                  color: tab === t ? "#B58A43" : "rgba(23,59,108,0.5)",
                  borderBottom: tab === t ? "2px solid #B58A43" : "2px solid transparent",
                  marginBottom: "-2px",
                }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="py-8">
            {tab === "descripcion" && (
              <div className="space-y-4 text-sm leading-relaxed" style={{ color: "rgba(23,59,108,0.75)" }}>
                <p>{course.description}</p>
                <p>Este curso ha sido diseñado por abogados en actividad con años de experiencia en los tribunales argentinos. El contenido es 100% práctico y orientado a la resolución de casos reales.</p>
                <div className="grid grid-cols-3 gap-4 mt-6">
                  {[
                    ["Módulos", `${course.modules}`],
                    ["Modalidad", course.duration],
                    ["Nivel", course.level],
                  ].map(([label, val]) => (
                    <div key={label} className="p-4 text-center rounded" style={{ backgroundColor: "rgba(23,59,108,0.04)", border: "1px solid rgba(23,59,108,0.08)" }}>
                      <p className="text-xl font-light" style={{ color: "#B58A43", fontFamily: "'Cormorant Garamond', serif" }}>{val}</p>
                      <p className="text-xs mt-1 uppercase tracking-widest" style={{ color: "rgba(23,59,108,0.5)" }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "temario" && (
              <div className="space-y-2">
                {course.temario.map((mod) => (
                  <div key={mod.mod} style={{ border: "1px solid rgba(23,59,108,0.1)", borderRadius: "4px" }}>
                    <button
                      onClick={() => toggleMod(mod.mod)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:opacity-80 transition-opacity"
                    >
                      <span className="text-sm font-bold text-left" style={{ color: "#173B6C" }}>
                        Módulo {mod.mod}: {mod.title}
                      </span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#173B6C" strokeWidth="2" className={`w-4 h-4 flex-shrink-0 transition-transform ${expandedMods.includes(mod.mod) ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                    {expandedMods.includes(mod.mod) && (
                      <div className="px-5 pb-4 space-y-2" style={{ borderTop: "1px solid rgba(23,59,108,0.06)" }}>
                        {mod.lessons.map((lesson) => (
                          <div key={lesson} className="flex items-center gap-2 py-1 text-sm" style={{ color: "rgba(23,59,108,0.7)" }}>
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#B58A43" }} />
                            {lesson}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === "docente" && (
              <div className="flex gap-5 items-start">
                {teacher?.img && <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0" style={{ border: "3px solid #B58A43" }}>
                  <img src={teacher.img} alt={teacher.name} className="w-full h-full object-cover" />
                </div>}
                <div>
                  <h3 className="text-2xl font-medium mb-1" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{course.professor}</h3>
                  <p className="text-xs mb-3" style={{ color: "#B58A43" }}>Docente del curso</p>
                  {teacher && <p className="text-sm leading-relaxed" style={{ color: "rgba(23,59,108,0.7)" }}>{teacher.role}</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right sticky column ── */}
        <div className="lg:sticky lg:top-24">
          <div className="p-8 rounded-lg" style={{ backgroundColor: "#FFFFFF", border: "2px solid #B58A43", boxShadow: "0 4px 24px rgba(23,59,108,0.1)" }}>
            <p className="text-center text-4xl font-light mb-2" style={{ color: "#B58A43", fontFamily: "'Cormorant Garamond', serif" }}>
              {course.price} ARS
            </p>
            <p className="text-center text-xs mb-6" style={{ color: "rgba(23,59,108,0.5)" }}>Acceso al aula tras la confirmación</p>

            {/* Info box */}
            <div className="p-4 rounded mb-6" style={{ backgroundColor: "#E8EDF3", border: "1px solid rgba(23,59,108,0.12)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "#173B6C" }}>
                <span className="font-bold">ℹ️ Importante:</span> Este formulario registra una solicitud pendiente y no realiza cobros. Al finalizar, comunicate por WhatsApp para coordinar el pago. Un administrador habilitará el acceso después de confirmarlo.
              </p>
            </div>

            <button
              onClick={onBuy}
              className="w-full py-4 text-sm font-bold tracking-widest mb-4 transition-all duration-200 hover:brightness-110 active:scale-95 rounded"
              style={{ backgroundColor: "#B58A43", color: "#FAF8F5", letterSpacing: "0.12em" }}
            >
              INSCRIBIRSE AL CURSO
            </button>

            <p className="text-center text-xs" style={{ color: "rgba(23,59,108,0.55)" }}>
              ¿Ya tienes cuenta en nuestra aula?{" "}
              <a href="/login" className="underline underline-offset-2 hover:opacity-60 transition-opacity" style={{ color: "#173B6C" }}>
                Inicia sesión aquí
              </a>
            </p>

            {/* What's included */}
            <div className="mt-6 pt-5 space-y-2.5" style={{ borderTop: "1px solid rgba(23,59,108,0.08)" }}>
              {[`${course.modules} módulos`, "Clases a tu ritmo", "Seguimiento del progreso", "Chat con el docente"].map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-xs" style={{ color: "rgba(23,59,108,0.7)" }}>
                  <span className="font-bold text-sm" style={{ color: "#B58A43" }}>✓</span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
