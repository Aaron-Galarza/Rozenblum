"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { CourseDTO, CourseDetailDTO, HomeContentDTO } from "@rozenblum/shared";
import type { PracticeArea } from "../types";
import { IconArrowUpRight, IconBriefcase, IconBuilding, IconClose, IconDoc, IconExternal, IconFamily, IconInstagram, IconMail, IconMapPin, IconPhone, IconShield, IconWhatsApp } from "../components/icons";
import LandingFooter from "../components/layout/LandingFooter";
import { apiFetch, errorMessage } from "../lib/api";
import { useModalA11y } from "../lib/use-modal-a11y";
import { usePublicSettings } from "../lib/use-public-settings";
import { optimizedImage, responsiveImageSet } from "../lib/images";
import { INSTITUTIONAL } from "../lib/institutional";

const NAV_LINKS = ["Inicio", "Áreas", "Nosotros", "Equipo", "Cursos", "Contacto"];

const AREA_ICONS = {
  briefcase: <IconBriefcase />,
  family: <IconFamily />,
  shield: <IconShield />,
  doc: <IconDoc />,
  building: <IconBuilding />,
};

function Modal({ area, onClose, onContact }: { area: PracticeArea; onClose: () => void; onContact: () => void }) {
  const titleId = useId();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(23,59,108,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto outline-none"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 24px 80px rgba(23,59,108,0.25)" }}
      >
        <div className="flex items-start justify-between p-8 pb-6" style={{ borderBottom: "1px solid rgba(23,59,108,0.1)" }}>
          <div>
            <p className="text-xs tracking-[0.2em] uppercase font-medium mb-2" style={{ color: "#B58A43" }}>Casos Comunes</p>
            <h2 id={titleId} className="text-3xl font-light" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{area.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex-shrink-0 ml-4 mt-1 w-9 h-9 flex items-center justify-center hover:scale-110 transition-transform" style={{ color: "#173B6C", backgroundColor: "rgba(23,59,108,0.06)" }}>
            <IconClose />
          </button>
        </div>
        <div className="p-8 space-y-6">
          {area.casos.map(({ q, a }) => (
            <div key={q} className="space-y-2">
              <div className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-1.5 h-1.5 mt-2 rounded-full" style={{ backgroundColor: "#B58A43" }} />
                <p className="text-lg font-medium" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{q}</p>
              </div>
              <p className="text-sm leading-relaxed pl-4" style={{ color: "rgba(23,59,108,0.7)" }}>{a}</p>
            </div>
          ))}
        </div>
        <div className="px-8 pb-8">
          <div className="h-px mb-6" style={{ backgroundColor: "rgba(23,59,108,0.1)" }} />
          <button
            onClick={onContact}
            className="w-full py-4 text-sm font-medium tracking-widest hover:brightness-110 active:scale-95 transition-all duration-200"
            style={{ backgroundColor: "#B58A43", color: "#FAF8F5", letterSpacing: "0.12em" }}
          >
            CONTACTAR A UN ABOGADO
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const settings = usePublicSettings();
  const [homeContent, setHomeContent] = useState<HomeContentDTO | null>(null);
  const [featuredCourse, setFeaturedCourse] = useState<CourseDTO | null>(null);
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [contentError, setContentError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<PracticeArea | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [contactStatus, setContactStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ type: "idle" });

  useEffect(() => {
    apiFetch<HomeContentDTO>("/api/content/home")
      .then(setHomeContent)
      .catch((error) => setContentError(errorMessage(error)));
    apiFetch<CourseDetailDTO>("/api/courses/latest")
      .then((detail) => setFeaturedCourse(detail.course))
      .catch((error) => setContentError(errorMessage(error)));
    apiFetch<CourseDTO[]>("/api/courses")
      .then(setCourses)
      .catch((error) => setContentError(errorMessage(error)));
  }, []);

  const practiceAreas: PracticeArea[] = (homeContent?.practiceAreas ?? []).map((area) => ({
    ...area,
    icon: AREA_ICONS[area.icon],
  }));
  const team = homeContent?.team ?? [];

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  const goToAula = () => router.push("/catalogo");

  const handleContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactStatus({ type: "loading" });
    try {
      await apiFetch<{ message: string }>("/api/contact", {
        method: "POST",
        body: formData,
      });
      setFormData({ name: "", email: "", message: "" });
      setContactStatus({
        type: "success",
        message: "Mensaje enviado. Nos pondremos en contacto a la brevedad.",
      });
    } catch (error) {
      setContactStatus({ type: "error", message: errorMessage(error) });
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
      {activeModal && (
        <Modal
          area={activeModal}
          onClose={() => setActiveModal(null)}
          onContact={() => { setActiveModal(null); scrollTo("contacto"); }}
        />
      )}

      {/* ── NAV ── */}
      <nav aria-label="Navegación principal" className="fixed top-0 left-0 right-0 z-50 shadow-[0_4px_24px_rgba(23,59,108,0.04)]" style={{ backgroundColor: "#FAF8F5", borderBottom: "1px solid rgba(23,59,108,0.1)" }}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-[72px]">
          <button onClick={() => scrollTo("inicio")} aria-label="Volver al inicio" className="flex-shrink-0 transition-opacity hover:opacity-75">
            {settings?.logoUrl && <img src={settings.logoUrl} alt={settings.companyName} className="h-11 w-auto object-contain" />}
          </button>
          <ul className="hidden lg:flex items-center gap-7">
            {NAV_LINKS.map((link) => (
              <li key={link}>
                <button
                  onClick={() => {
                    if (link === "Cursos") { goToAula(); return; }
                    scrollTo(link.toLowerCase().replace("á","a").replace("é","e").replace("ó","o").replace("ú","u").replace("í","i"));
                  }}
                  className="border-b border-transparent py-2 text-xs font-medium tracking-[0.12em] transition-colors duration-200 hover:border-[#B58A43]"
                  style={{ color: "#173B6C" }}
                >
                  {link.toUpperCase()}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <button onClick={() => scrollTo("contacto")} className="hidden lg:block px-5 py-3 text-xs font-medium tracking-widest hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#FAF8F5", letterSpacing: "0.1em" }}>
              AGENDAR CONSULTA
            </button>
            <button type="button" aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuOpen} aria-controls="menu-principal-mobile" className="flex min-h-11 min-w-11 items-center justify-center lg:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: "#173B6C" }}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                {menuOpen ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <div id="menu-principal-mobile" className="lg:hidden px-6 pb-6 pt-3 space-y-1 shadow-[0_16px_24px_rgba(23,59,108,0.08)]" style={{ backgroundColor: "#FAF8F5", borderTop: "1px solid rgba(23,59,108,0.1)" }}>
            {NAV_LINKS.map((link) => (
              <button key={link} onClick={() => { if (link === "Cursos") { setMenuOpen(false); goToAula(); return; } scrollTo(link.toLowerCase().replace("á","a").replace("é","e").replace("ó","o").replace("ú","u").replace("í","i")); }} className="block min-h-11 w-full border-b border-[#173B6C]/5 py-3 text-left text-xs font-medium tracking-widest transition-colors hover:text-[#9A7435]" style={{ color: "#173B6C" }}>
                {link.toUpperCase()}
              </button>
            ))}
            <button onClick={() => scrollTo("contacto")} className="w-full py-3 text-xs font-medium tracking-widest" style={{ backgroundColor: "#B58A43", color: "#FAF8F5" }}>
              AGENDAR CONSULTA
            </button>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section id="inicio" className="pt-[72px]">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center min-h-[calc(100vh-72px)] py-20">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
              <span className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: "#B58A43" }}>{homeContent?.brand.locationLabel}</span>
            </div>
            <h1 className="text-5xl lg:text-6xl xl:text-[68px] leading-[1.08] font-light" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>
              Excelencia Jurídica<br />
              <span className="font-semibold italic" style={{ color: "#72132C" }}>y Formación</span><br />
              Profesional
            </h1>
            <p className="text-base lg:text-lg leading-relaxed max-w-md" style={{ color: "#173B6C", opacity: 0.72 }}>
              Asesoramiento legal y capacitación para profesionales del derecho. Defendemos sus derechos con rigor, experiencia y compromiso ético.
            </p>
            <div className="flex flex-wrap gap-4">
              <button onClick={() => scrollTo("contacto")} className="px-8 py-4 text-xs font-medium tracking-widest hover:brightness-110 active:scale-95 transition-all duration-200" style={{ backgroundColor: "#B58A43", color: "#FAF8F5", letterSpacing: "0.14em" }}>
                CONSULTAR CASO
              </button>
              <button onClick={goToAula} className="px-8 py-4 text-xs font-medium tracking-widest border transition-colors duration-200 hover:bg-blue-50" style={{ color: "#173B6C", borderColor: "#173B6C" }}>
                VER CURSOS
              </button>
            </div>
            <div className="flex gap-10 pt-2">
              {(homeContent?.brand.metrics ?? []).map(({ value, label }) => (
                <div key={label}>
                  <p className="text-3xl font-light" style={{ color: "#B58A43", fontFamily: "'Cormorant Garamond', serif" }}>{value}</p>
                  <p className="text-xs tracking-widest uppercase mt-0.5" style={{ color: "#173B6C", opacity: 0.5 }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden lg:block relative">
            {homeContent?.brand.heroImage && <img src={optimizedImage(homeContent.brand.heroImage, 960)} srcSet={responsiveImageSet(homeContent.brand.heroImage)} sizes="(max-width: 1024px) 100vw, 50vw" alt="Despacho jurídico moderno" className="w-full object-cover" style={{ height: 560 }} />}
            <div className="absolute -bottom-4 -right-4 w-40 h-40 border-2 pointer-events-none" style={{ borderColor: "#B58A43" }} />
            <div className="absolute bottom-8 left-8 px-6 py-5" style={{ backgroundColor: "#173B6C" }}>
              <p className="text-xs tracking-widest uppercase" style={{ color: "#B58A43" }}>Fundado en</p>
              <p className="text-4xl font-light mt-1" style={{ color: "#FAF8F5", fontFamily: "'Cormorant Garamond', serif" }}>{homeContent?.brand.foundedYear}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── ÁREAS ── */}
      <section id="areas" className="py-24" style={{ backgroundColor: "#FAF8F5" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-14">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
              <span className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: "#B58A43" }}>Especialidades</span>
            </div>
            <h2 className="text-5xl font-light" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Áreas de Práctica</h2>
            <p className="mt-3 text-sm leading-relaxed max-w-lg" style={{ color: "#173B6C", opacity: 0.65 }}>Equipos especializados con profundo conocimiento de la jurisprudencia nacional y provincial.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {contentError && <p role="alert" className="mb-6 text-sm" style={{ color: "#72132C" }}>No se pudo cargar el contenido: {contentError}</p>}
            {practiceAreas.map((area) => (
              <div key={area.title} className="group flex flex-col p-7 gap-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl" style={{ backgroundColor: "#173B6C" }}>
                <div style={{ color: "#B58A43" }} className="transition-transform duration-300 group-hover:scale-110">{area.icon}</div>
                <div className="flex-1 space-y-2">
                  <h3 className="text-xl font-medium leading-snug" style={{ color: "#FAF8F5", fontFamily: "'Cormorant Garamond', serif" }}>{area.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(250,248,245,0.55)" }}>{area.desc}</p>
                </div>
                <div className="mt-auto">
                  <div className="h-px mb-4" style={{ backgroundColor: "rgba(181,138,67,0.3)" }} />
                  <button onClick={() => setActiveModal(area)} className="flex items-center gap-1.5 text-xs font-medium tracking-wide hover:gap-2.5 transition-all duration-200" style={{ color: "#B58A43" }}>
                    Ver casos comunes
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CURSOS ── */}
      <section id="cursos" className="py-24" style={{ backgroundColor: "#173B6C" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-14">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
              <span className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: "#B58A43" }}>Academia Jurídica</span>
            </div>
            <h2 className="text-5xl font-light max-w-2xl leading-tight" style={{ color: "#FAF8F5", fontFamily: "'Cormorant Garamond', serif" }}>Capacitación para Estudiantes y Profesionales</h2>
            <p className="mt-4 text-base leading-relaxed max-w-xl" style={{ color: "rgba(250,248,245,0.65)" }}>
              Llevá tu carrera al siguiente nivel con nuestros cursos especializados. Accedé a nuestra plataforma virtual para inscribirte y ver el material.
            </p>
          </div>
          {featuredCourse && <div className="grid lg:grid-cols-5 overflow-hidden" style={{ border: "1px solid rgba(181,138,67,0.3)" }}>
            <div className="lg:col-span-2 relative overflow-hidden" style={{ minHeight: 280 }}>
              <img src={optimizedImage(featuredCourse.img, 960)} srcSet={responsiveImageSet(featuredCourse.img)} sizes="(max-width: 1024px) 100vw, 40vw" alt={featuredCourse.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to right, transparent 50%, #173B6C)" }} />
              <div className="absolute top-5 left-5 px-3 py-1.5 text-xs font-medium tracking-widest" style={{ backgroundColor: "#B58A43", color: "#FAF8F5" }}>DESTACADO</div>
            </div>
            <div className="lg:col-span-3 p-10 lg:p-14 flex flex-col justify-center gap-6" style={{ backgroundColor: "rgba(250,248,245,0.04)" }}>
              <div>
                <p className="text-xs tracking-widest uppercase mb-2" style={{ color: "#B58A43" }}>Curso Principal</p>
                <h3 className="text-3xl lg:text-4xl font-light leading-snug" style={{ color: "#FAF8F5", fontFamily: "'Cormorant Garamond', serif" }}>{featuredCourse.title}</h3>
                <p className="mt-4 text-sm leading-relaxed" style={{ color: "rgba(250,248,245,0.65)" }}>
                  {featuredCourse.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {[`${featuredCourse.modules} módulos`, featuredCourse.duration, featuredCourse.level].map((tag) => (
                  <span key={tag} className="px-4 py-1.5 text-xs font-medium tracking-wide" style={{ color: "#B58A43", border: "1px solid rgba(181,138,67,0.35)", backgroundColor: "rgba(181,138,67,0.08)" }}>{tag}</span>
                ))}
              </div>
              <div>
                <button
                  onClick={() => router.push(`/cursos/${featuredCourse.slug}`)}
                  className="inline-flex items-center gap-2.5 px-8 py-4 text-xs font-medium tracking-widest hover:brightness-110 active:scale-95 transition-all duration-200"
                  style={{ backgroundColor: "#B58A43", color: "#FAF8F5", letterSpacing: "0.12em" }}
                >
                  IR AL AULA VIRTUAL
                  <IconExternal />
                </button>
              </div>
            </div>
          </div>}
          <div className="mt-6 grid sm:grid-cols-3 gap-4">
            {courses.filter((course) => course.slug !== featuredCourse?.slug).slice(0, 3).map((course) => (
              <button key={course.id} onClick={() => router.push(`/cursos/${course.slug}`)} className="p-6 flex flex-col gap-2 text-left" style={{ border: "1px solid rgba(181,138,67,0.15)", backgroundColor: "rgba(250,248,245,0.03)" }}>
                <h4 className="text-lg font-medium" style={{ color: "#FAF8F5", fontFamily: "'Cormorant Garamond', serif" }}>{course.title}</h4>
                <p className="text-xs" style={{ color: "rgba(250,248,245,0.45)" }}>{course.description}</p>
                <p className="text-xs font-medium mt-1" style={{ color: "#B58A43" }}>Ver curso →</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── NOSOTROS ── */}
      <section id="nosotros" className="py-24" style={{ backgroundColor: "#FAF8F5" }}>
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
              <span className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: "#B58A43" }}>Nuestra Historia</span>
            </div>
            <h2 className="text-5xl font-light leading-tight" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Más de Dos Décadas de Compromiso Jurídico</h2>
            <div className="space-y-5 text-sm leading-relaxed" style={{ color: "rgba(23,59,108,0.72)" }}>
              {(homeContent?.brand.aboutParagraphs ?? []).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[["Rigor","Precisión en cada caso"],["Ética","Transparencia ante todo"],["Proximidad","Trato personalizado"],["Resultados","Soluciones concretas"]].map(([v,d]) => (
                <div key={v} className="flex gap-3">
                  <div className="w-1 flex-shrink-0 mt-0.5" style={{ backgroundColor: "#B58A43" }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#173B6C" }}>{v}</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(23,59,108,0.5)" }}>{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Value pillars */}
          <div className="flex flex-col gap-5">
            {[
              { label: "Compromiso", desc: "Defendemos tus intereses con dedicación y profesionalismo en cada caso.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
              { label: "Confianza", desc: "Construimos una relación sólida basada en la transparencia y comunicación.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg> },
              { label: "Experiencia", desc: "Años de trayectoria nos respaldan en la resolución de conflictos legales.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg> },
            ].map(({ label, desc, icon }, i) => (
              <div key={label} className="flex items-start gap-6 p-7 group transition-all duration-300 hover:shadow-lg" style={{ backgroundColor: "#173B6C" }}>
                <div className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-110" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>{icon}</div>
                <div className="space-y-1.5 flex-1">
                  <h3 className="text-2xl font-semibold" style={{ color: "#B58A43", fontFamily: "'Cormorant Garamond', serif" }}>{label}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(250,248,245,0.72)" }}>{desc}</p>
                </div>
                <span className="ml-auto flex-shrink-0 text-5xl font-light leading-none select-none" style={{ color: "rgba(181,138,67,0.12)", fontFamily: "'Cormorant Garamond', serif" }}>0{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── EQUIPO ── */}
      <section id="equipo" className="py-24" style={{ backgroundColor: "#FAF8F5", borderTop: "1px solid rgba(23,59,108,0.08)" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
              <span className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: "#B58A43" }}>Profesionales</span>
              <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
            </div>
            <h2 className="text-5xl font-light" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Nuestro Equipo</h2>
            <p className="mt-4 text-sm max-w-md mx-auto" style={{ color: "rgba(23,59,108,0.65)" }}>Abogados con trayectoria comprobada, formación continua y vocación por la defensa de los derechos de nuestros clientes.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {team.map((m) => (
              <div key={m.name} className="flex flex-col items-center text-center group">
                <div className="relative mb-5">
                  <div className="w-36 h-36 lg:w-44 lg:h-44 rounded-full overflow-hidden border-4 transition-all duration-300" style={{ borderColor: "rgba(23,59,108,0.12)" }}>
                    <img src={optimizedImage(m.img, 640)} srcSet={responsiveImageSet(m.img)} sizes="(max-width: 640px) 80vw, 25vw" alt={m.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-0.5" style={{ backgroundColor: "#B58A43" }} />
                </div>
                <h3 className="text-lg font-medium mt-3" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{m.name}</h3>
                <p className="text-xs tracking-wide mt-1.5" style={{ color: "#B58A43" }}>{m.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACTO & FOOTER ── */}
      <footer id="contacto" className="relative overflow-hidden" style={{ backgroundColor: "#173B6C" }}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full border" style={{ borderColor: "rgba(181,138,67,0.16)" }} />
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-16 h-44 w-44 rounded-full border" style={{ borderColor: "rgba(181,138,67,0.1)" }} />
        <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
          <div className="mb-10 sm:mb-14">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
              <span className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: "#B58A43" }}>Contáctenos</span>
            </div>
            <h2 className="text-4xl font-light sm:text-5xl" style={{ color: "#FAF8F5", fontFamily: "'Cormorant Garamond', serif" }}>Contacto</h2>
          </div>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_0.82fr] lg:gap-16">
            <div className="flex min-w-0 flex-col">
            <form className="space-y-5" onSubmit={handleContact}>
              {[{ id: "name", label: "Nombre completo", type: "text", placeholder: "Ej. Juan García" }, { id: "email", label: "Correo electrónico", type: "email", placeholder: "juan@ejemplo.com" }].map(({ id, label, type, placeholder }) => (
                <div key={id} className="flex flex-col gap-2">
                  <label htmlFor={`contact-${id}`} className="text-xs font-medium tracking-widest uppercase" style={{ color: "rgba(250,248,245,0.6)" }}>{label}</label>
                  <input id={`contact-${id}`} required minLength={id === "name" ? 3 : undefined} maxLength={id === "name" ? 120 : undefined} type={type} placeholder={placeholder} value={formData[id as keyof typeof formData]} onChange={(e) => setFormData({ ...formData, [id]: e.target.value })} className="w-full px-4 py-3.5 text-sm outline-none transition-all duration-200" style={{ backgroundColor: "rgba(250,248,245,0.06)", border: "1px solid rgba(250,248,245,0.15)", color: "#FAF8F5" }} onFocus={(e) => (e.target.style.borderColor = "#B58A43")} onBlur={(e) => (e.target.style.borderColor = "rgba(250,248,245,0.15)")} />
                </div>
              ))}
              <div className="flex flex-col gap-2">
                <label htmlFor="contact-message" className="text-xs font-medium tracking-widest uppercase" style={{ color: "rgba(250,248,245,0.6)" }}>Mensaje</label>
                <textarea id="contact-message" required rows={5} minLength={10} maxLength={2000} placeholder="Describa brevemente su consulta..." value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} className="w-full px-4 py-3.5 text-sm outline-none resize-none transition-all duration-200" style={{ backgroundColor: "rgba(250,248,245,0.06)", border: "1px solid rgba(250,248,245,0.15)", color: "#FAF8F5" }} onFocus={(e) => (e.target.style.borderColor = "#B58A43")} onBlur={(e) => (e.target.style.borderColor = "rgba(250,248,245,0.15)")} />
              </div>
              {contactStatus.type === "success" && (
                <p className="text-xs leading-relaxed" style={{ color: "#D4A855" }} role="status">{contactStatus.message}</p>
              )}
              {contactStatus.type === "error" && (
                <p className="text-xs leading-relaxed" style={{ color: "#ffb3b3" }} role="alert">{contactStatus.message}</p>
              )}
              <button type="submit" disabled={contactStatus.type === "loading"} className="min-h-13 w-full py-4 text-xs font-medium tracking-widest transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-70" style={{ backgroundColor: "#B58A43", color: "#FAF8F5", letterSpacing: "0.14em" }}>
                {contactStatus.type === "loading" ? "ENVIANDO..." : "ENVIAR MENSAJE"}
              </button>
            </form>
            <div className="mt-8 border p-3" style={{ borderColor: "rgba(181,138,67,0.35)", backgroundColor: "rgba(250,248,245,0.03)" }}>
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#B58A43" }}>Ubicación</p>
                  <p className="truncate text-xs" style={{ color: "rgba(250,248,245,0.85)" }}>{INSTITUTIONAL.address}</p>
                </div>
                <a href={INSTITUTIONAL.mapsHref} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide transition-colors hover:text-white" style={{ color: "#D4A855" }}>
                  Cómo llegar <IconArrowUpRight className="h-3 w-3" />
                </a>
              </div>
              <iframe title={`Mapa de ubicación: ${INSTITUTIONAL.address}`} src={INSTITUTIONAL.mapsEmbedSrc} className="block h-44 w-full border-0 sm:h-48" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
            </div>
            </div>
            <div className="flex flex-col gap-7 lg:pt-1">
              <div className="border-b pb-6" style={{ borderColor: "rgba(250,248,245,0.12)" }}>
                <p className="text-2xl font-light mb-3" style={{ color: "#FAF8F5", fontFamily: "'Cormorant Garamond', serif" }}>Estamos para asesorarle</p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(250,248,245,0.6)" }}>Escribinos a través del formulario y el estudio responderá a tu consulta.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <a href={INSTITUTIONAL.mapsHref} target="_blank" rel="noopener noreferrer" className="group flex min-h-22 items-start gap-4 border p-4 transition-colors hover:bg-white/[0.04]" style={{ borderColor: "rgba(250,248,245,0.12)" }}>
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center" style={{ backgroundColor: "rgba(181,138,67,0.15)", color: "#D4A855" }}><IconMapPin className="h-5 w-5" /></span>
                  <div><p className="mb-1 text-xs font-medium uppercase tracking-widest" style={{ color: "#B58A43" }}>Dirección</p><span className="text-sm leading-relaxed" style={{ color: "rgba(250,248,245,0.85)" }}>{INSTITUTIONAL.address}</span></div>
                  <IconArrowUpRight className="ml-auto h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "#D4A855" }} />
                </a>
                <a href={INSTITUTIONAL.phoneHref} className="group flex min-h-22 items-start gap-4 border p-4 transition-colors hover:bg-white/[0.04]" style={{ borderColor: "rgba(250,248,245,0.12)" }}>
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center" style={{ backgroundColor: "rgba(181,138,67,0.15)", color: "#D4A855" }}><IconPhone className="h-5 w-5" /></span>
                  <div><p className="mb-1 text-xs font-medium uppercase tracking-widest" style={{ color: "#B58A43" }}>Teléfono</p><span className="text-sm" style={{ color: "rgba(250,248,245,0.85)" }}>{INSTITUTIONAL.phone}</span></div>
                </a>
                <a href={INSTITUTIONAL.emailHref} className="group flex min-h-22 items-start gap-4 border p-4 transition-colors hover:bg-white/[0.04]" style={{ borderColor: "rgba(250,248,245,0.12)" }}>
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center" style={{ backgroundColor: "rgba(181,138,67,0.15)", color: "#D4A855" }}><IconMail className="h-5 w-5" /></span>
                  <div><p className="mb-1 text-xs font-medium uppercase tracking-widest" style={{ color: "#B58A43" }}>Correo electrónico</p><span className="break-all text-sm" style={{ color: "rgba(250,248,245,0.85)" }}>{INSTITUTIONAL.email}</span></div>
                </a>
                <a href={INSTITUTIONAL.whatsappHref} target="_blank" rel="noopener noreferrer" className="group flex min-h-22 items-start gap-4 border p-4 transition-colors hover:bg-white/[0.04]" style={{ borderColor: "rgba(250,248,245,0.12)" }}>
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center" style={{ backgroundColor: "rgba(181,138,67,0.15)", color: "#D4A855" }}><IconWhatsApp className="h-5 w-5" /></span>
                  <div><p className="mb-1 text-xs font-medium uppercase tracking-widest" style={{ color: "#B58A43" }}>WhatsApp</p><span className="text-sm" style={{ color: "rgba(250,248,245,0.85)" }}>Escribinos directamente</span></div>
                  <IconArrowUpRight className="ml-auto h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "#D4A855" }} />
                </a>
                <a href={INSTITUTIONAL.instagramHref} target="_blank" rel="noopener noreferrer" className="group flex min-h-22 items-start gap-4 border p-4 transition-colors hover:bg-white/[0.04]" style={{ borderColor: "rgba(250,248,245,0.12)" }}>
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center" style={{ backgroundColor: "rgba(181,138,67,0.15)", color: "#D4A855" }}><IconInstagram className="h-5 w-5" /></span>
                  <div><p className="mb-1 text-xs font-medium uppercase tracking-widest" style={{ color: "#B58A43" }}>Instagram</p><span className="break-all text-sm" style={{ color: "rgba(250,248,245,0.85)" }}>@estudio_juridico_rozenblum_</span></div>
                  <IconArrowUpRight className="ml-auto h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "#D4A855" }} />
                </a>
              </div>
            </div>
          </div>
        </div>
        <LandingFooter scrollTo={scrollTo} goToAula={goToAula} tagline={homeContent?.brand.footerTagline} />
      </footer>
    </div>
  );
}
