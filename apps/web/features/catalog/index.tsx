"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CourseDTO } from "@rozenblum/shared";
import type { Course } from "../../types";
import PublicHeader from "../../components/layout/PublicHeader";
import CourseCard from "./CourseCard";
import { apiFetch, errorMessage } from "../../lib/api";
import { usePublicSettings } from "../../lib/use-public-settings";
import { ErrorPanel, LoadingScreen } from "../../components/ui/AsyncState";

export function courseFromDTO(course: CourseDTO): Course {
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    price: course.price,
    priceCents: course.priceCents,
    modules: course.modules,
    duration: course.duration,
    level: course.level,
    img: course.img,
    professor: course.professor,
    temario: course.temario,
  };
}

export default function CatalogPage() {
  const settings = usePublicSettings();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<CourseDTO[]>("/api/courses");
      setCourses(data.map(courseFromDTO));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
      {/* ── HEADER ── */}
      <PublicHeader
        onLogoClick={() => router.push("/")}
        rightSlot={
          <button
            onClick={() => router.push("/login")}
            className="px-4 py-2 text-xs font-medium tracking-widest border transition-all duration-200 hover:brightness-110"
            style={{ color: "#173B6C", borderColor: "#B58A43" }}
          >
            INICIAR SESIÓN
          </button>
        }
      />

      {/* ── HERO BANNER ── */}
      <div className="py-16 px-6 text-center" style={{ borderBottom: "1px solid rgba(23,59,108,0.08)" }}>
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
          <span className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: "#B58A43" }}>Academia Jurídica</span>
          <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
        </div>
        <h1
          className="text-5xl lg:text-6xl font-light mb-4"
          style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}
        >
          Capacitación Jurídica On-Demand
        </h1>
        <p className="text-base max-w-xl mx-auto leading-relaxed" style={{ color: "rgba(23,59,108,0.72)" }}>
          Fórmate con expertos. Solicitá tu inscripción y consultá las instrucciones de pago; el acceso al aula se habilita después de la confirmación.
        </p>
      </div>

      {/* ── COURSE GRID ── */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        {loading ? (
          <LoadingScreen label="Cargando catálogo..." />
        ) : error ? (
          <ErrorPanel message={error} onRetry={() => void load()} />
        ) : courses.length === 0 ? (
          <p className="text-center text-sm" style={{ color: "rgba(23,59,108,0.65)" }}>
            Todavía no hay cursos publicados.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                onSelect={(selected) => router.push(`/cursos/${selected.slug ?? selected.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <footer className="py-5 px-6 text-center" style={{ backgroundColor: "#173B6C" }}>
        <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>
          © {new Date().getFullYear()} Estudio Jurídico Rozenblum · Términos de Servicio · Política de Privacidad {settings && <>· Soporte: {settings.supportEmail}</>}
        </p>
      </footer>
    </div>
  );
}
