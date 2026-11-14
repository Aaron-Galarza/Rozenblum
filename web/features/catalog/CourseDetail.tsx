"use client";

import { useEffect, useState } from "react";
import type { CourseDetailDTO, HomeContentDTO } from "@rozenblum/shared";
import type { Course, DetailTab } from "../../types";
import { apiFetch } from "../../lib/api";
import { optimizedImage, responsiveImageSet } from "../../lib/images";
import { IconInfo } from "../../components/icons";

type CourseDetailProps = {
  course: Course;
  professor: CourseDetailDTO["professor"] | null;
  onBack: () => void;
  onBuy: () => void;
};

export default function CourseDetail({ course, professor, onBack, onBuy }: CourseDetailProps) {
  const [tab, setTab] = useState<DetailTab>("descripcion");
  const [expandedMods, setExpandedMods] = useState<number[]>([1]);
  const [homeContent, setHomeContent] = useState<HomeContentDTO | null>(null);

  useEffect(() => {
    if (!professor?.img) apiFetch<HomeContentDTO>("/api/content/home").then(setHomeContent).catch(() => setHomeContent(null));
  }, [professor?.img]);
  const teacherPhoto = professor?.img ?? homeContent?.team.find((member) => member.name === course.professor)?.img;
  const registrationClosed = Boolean(course.enrollmentClosesAt &&
    Date.parse(course.enrollmentClosesAt) <= Date.now());

  const toggleMod = (id: number) =>
    setExpandedMods((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <button onClick={onBack} className="flex min-h-11 items-center gap-1.5 text-xs hover:opacity-60 transition-opacity" style={{ color: "#173B6C" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          Volver al catálogo
        </button>
      </div>

      <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 pb-28 sm:px-6 lg:grid-cols-[1fr_360px] lg:gap-12 lg:pb-20">
        {/* ── Left column ── */}
        <div>
          {/* Course cover */}
          <div
            className="w-full flex items-center justify-center mb-8 rounded-lg overflow-hidden"
            style={{ aspectRatio: "16/9", backgroundColor: "#0f172a", position: "relative" }}
          >
            <img src={optimizedImage(course.img, 960)} srcSet={responsiveImageSet(course.img)} sizes="(max-width: 1024px) 100vw, 65vw" alt={course.title} className="absolute inset-0 w-full h-full object-cover opacity-40" />
          </div>

          <h1 className="mb-2 text-3xl font-light sm:text-4xl lg:text-5xl" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>
            {course.title}
          </h1>
          <p className="text-sm mb-8" style={{ color: "rgba(23,59,108,0.65)" }}>Por {professor?.name ?? course.professor}</p>

          {/* Tabs */}
          <div className="grid grid-cols-3" style={{ borderBottom: "2px solid rgba(23,59,108,0.1)" }}>
            {(["descripcion", "temario", "docente"] as DetailTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="min-h-11 px-2 py-3 text-[11px] font-medium uppercase tracking-wide transition-all sm:px-6 sm:text-xs sm:tracking-widest"
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
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
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
                      className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-4 hover:opacity-80 transition-opacity sm:px-5"
                    >
                      <span className="text-sm font-bold text-left" style={{ color: "#173B6C" }}>
                        Módulo {mod.mod}: {mod.title}
                      </span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#173B6C" strokeWidth="2" className={`w-4 h-4 flex-shrink-0 transition-transform ${expandedMods.includes(mod.mod) ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                    {expandedMods.includes(mod.mod) && (
                      <div className="px-4 pb-4 space-y-2 sm:px-5" style={{ borderTop: "1px solid rgba(23,59,108,0.06)" }}>
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
                {teacherPhoto && <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0" style={{ border: "3px solid #B58A43" }}>
                  <img src={optimizedImage(teacherPhoto, 320)} alt={professor?.name ?? course.professor} className="w-full h-full object-cover" />
                </div>}
                <div>
                  <h3 className="text-2xl font-medium mb-1" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{professor?.name ?? course.professor}</h3>
                  <p className="text-xs mb-3" style={{ color: "#B58A43" }}>Docente del curso</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right sticky column ── */}
        <div className="lg:sticky lg:top-24">
          <div className="rounded-lg p-5 sm:p-8" style={{ backgroundColor: "#FFFFFF", border: "2px solid #B58A43", boxShadow: "0 4px 24px rgba(23,59,108,0.1)" }}>
            <p className="mb-2 text-center text-3xl font-light sm:text-4xl" style={{ color: "#B58A43", fontFamily: "'Cormorant Garamond', serif" }}>
              {course.price} ARS
            </p>
            <p className="mb-6 text-center text-xs" style={{ color: "rgba(23,59,108,0.5)" }}>Acceso al aula tras la confirmación</p>

            {/* Info box */}
            <div className="mb-6 rounded p-4" style={{ backgroundColor: "#E8EDF3", border: "1px solid rgba(23,59,108,0.12)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "#173B6C" }}>
                <span className="inline-flex items-center gap-1 font-bold"><IconInfo className="h-3.5 w-3.5" /> Importante:</span> La inscripción se paga en Mercado Pago. El acceso al aula se activa automáticamente cuando Mercado Pago confirma el pago.
              </p>
            </div>

            <button
              onClick={onBuy}
              disabled={registrationClosed}
              className="mb-4 min-h-12 w-full rounded py-4 text-sm font-bold tracking-widest transition-all duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-55"
              style={{ backgroundColor: "#B58A43", color: "#FAF8F5", letterSpacing: "0.12em" }}
            >
              {registrationClosed ? "INSCRIPCIONES CERRADAS" : "INSCRIBIRSE AL CURSO"}
            </button>

            {registrationClosed && <p className="mb-4 text-center text-xs" style={{ color: "#72132C" }}>
              Las inscripciones cierran siete días antes de que finalice el curso.
            </p>}

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

      {/* CTA móvil: mantiene la inscripción visible sin tocar el layout de escritorio. */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t px-4 pt-3 shadow-[0_-8px_24px_rgba(23,59,108,0.12)] lg:hidden"
        style={{ backgroundColor: "#FFFFFF", borderColor: "rgba(181,138,67,0.35)", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-medium uppercase tracking-widest" style={{ color: "#B58A43" }}>Inscripción</p>
            <p className="truncate text-lg font-light" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{course.price} ARS</p>
          </div>
          <button
            type="button"
            onClick={onBuy}
            disabled={registrationClosed}
            className="min-h-12 shrink-0 rounded px-4 text-xs font-bold tracking-widest transition-all duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-55"
            style={{ backgroundColor: "#B58A43", color: "#FAF8F5", letterSpacing: "0.08em" }}
          >
            {registrationClosed ? "CERRADAS" : "INSCRIBIRME"}
          </button>
        </div>
      </div>
    </div>
  );
}
