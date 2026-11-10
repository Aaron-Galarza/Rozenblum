"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CourseDetailDTO } from "@rozenblum/shared";
import type { Course } from "../../types";
import PublicHeader from "../../components/layout/PublicHeader";
import CourseDetail from "./CourseDetail";
import CheckoutModal from "./CheckoutModal";
import { courseFromDTO } from "./index";
import { apiFetch, errorMessage } from "../../lib/api";
import { ErrorPanel, LoadingScreen } from "../../components/ui/AsyncState";

export default function CourseDetailPage({ slug }: { slug: string }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [professor, setProfessor] = useState<CourseDetailDTO["professor"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<CourseDetailDTO>(`/api/courses/${encodeURIComponent(slug)}`);
      setCourse(courseFromDTO(data.course));
      setProfessor(data.professor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [slug]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
      {course && checkoutOpen && (
        <CheckoutModal
          course={course}
          onClose={() => setCheckoutOpen(false)}
        />
      )}

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

      {loading ? (
        <LoadingScreen label="Cargando curso..." />
      ) : error ? (
        <ErrorPanel title="Curso no disponible" message={error} onRetry={() => void load()} />
      ) : course ? (
        <CourseDetail
          course={course}
          professor={professor}
          onBack={() => router.push("/catalogo")}
          onBuy={() => setCheckoutOpen(true)}
        />
      ) : null}

      <footer className="py-5 px-6 text-center" style={{ backgroundColor: "#173B6C" }}>
        <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>
          © {new Date().getFullYear()} Estudio Jurídico Rozenblum ·{" "}
          <Link href="/terminos-y-condiciones" className="hover:underline">Términos de Servicio</Link> ·{" "}
          <Link href="/politica-de-privacidad" className="hover:underline">Política de Privacidad</Link>
        </p>
      </footer>
    </div>
  );
}
