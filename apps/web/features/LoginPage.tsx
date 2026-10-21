"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionDTO } from "@rozenblum/shared";
import { apiFetch, errorMessage, saveSession } from "../lib/api";

const DEMO_PASSWORD = "rozenblum-demo-2026";

const ROLES = [
  {
    key: "alumno",
    title: "Alumno",
    desc: "Accede a tus cursos, visualiza tu progreso y descarga certificados.",
    cta: "INGRESAR COMO ALUMNO",
    demoEmail: "alumno@rozenblum.com",
    demoPass: DEMO_PASSWORD,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    key: "profesor",
    title: "Profesor",
    desc: "Gestiona tus cursos, revisa el progreso de alumnos y responde dudas.",
    cta: "INGRESAR COMO PROFESOR",
    demoEmail: "profesor@rozenblum.com",
    demoPass: DEMO_PASSWORD,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    key: "admin",
    title: "Administrador",
    desc: "Panel completo: gestiona profesores, alumnos, pagos y toda la plataforma.",
    cta: "INGRESAR COMO ADMIN",
    demoEmail: "admin@rozenblum.com",
    demoPass: DEMO_PASSWORD,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
];

type Role = typeof ROLES[number];

function LoginModal({ role, onClose, onLogin }: { role: Role; onClose: () => void; onLogin: (session: SessionDTO) => void }) {
  const [email, setEmail] = useState(role.demoEmail);
  const [pass, setPass] = useState(role.demoPass);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !pass) { setError("Completa todos los campos."); return; }
    setError("");
    setLoading(true);
    try {
      const session = await apiFetch<SessionDTO>("/api/auth/demo-login", {
        method: "POST",
        body: { role: role.key, email, password: pass },
      });
      saveSession(session);
      onLogin(session);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: "rgba(23,59,108,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-sm mx-4 flex flex-col"
        style={{ backgroundColor: "#FAF8F5", borderRadius: "10px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", border: "1px solid rgba(181,138,67,0.3)" }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid rgba(23,59,108,0.08)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "#173B6C", color: "#B58A43" }}>
              {role.icon}
            </div>
            <div>
              <p className="text-xs font-medium tracking-widest uppercase" style={{ color: "#B58A43" }}>Acceso</p>
              <p className="text-base font-medium" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{role.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:opacity-50 transition-opacity" style={{ color: "#173B6C" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 tracking-wide" style={{ color: "rgba(23,59,108,0.7)" }}>
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 text-sm outline-none transition-all duration-150"
              style={{
                border: "1px solid rgba(23,59,108,0.2)",
                borderRadius: "4px",
                color: "#173B6C",
                fontFamily: "'Roboto', sans-serif",
                backgroundColor: "#FFFFFF",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#B58A43")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(23,59,108,0.2)")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 tracking-wide" style={{ color: "rgba(23,59,108,0.7)" }}>
              Contraseña
            </label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="w-full px-3 py-2.5 text-sm outline-none transition-all duration-150"
              style={{
                border: "1px solid rgba(23,59,108,0.2)",
                borderRadius: "4px",
                color: "#173B6C",
                fontFamily: "'Roboto', sans-serif",
                backgroundColor: "#FFFFFF",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#B58A43")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(23,59,108,0.2)")}
            />
          </div>

          {/* Demo hint */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded" style={{ backgroundColor: "rgba(181,138,67,0.08)", border: "1px solid rgba(181,138,67,0.2)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#B58A43" strokeWidth="1.5" className="w-4 h-4 flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(23,59,108,0.65)" }}>
              Credenciales de demo ya cargadas. Simplemente presioná <span className="font-semibold">Ingresar</span>.
            </p>
          </div>

          {error && <p className="text-xs text-center" style={{ color: "#72132C" }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-xs font-bold tracking-widest transition-all duration-200 hover:brightness-110 active:scale-95 flex items-center justify-center gap-2"
            style={{ backgroundColor: "#173B6C", color: "#FAF8F5", borderRadius: "4px", letterSpacing: "0.12em", opacity: loading ? 0.8 : 1 }}
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0110 10" /></svg>
                INGRESANDO...
              </>
            ) : "INGRESAR"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [activeRole, setActiveRole] = useState<Role | null>(null);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5" style={{ borderBottom: "1px solid rgba(23,59,108,0.1)" }}>
        <img
          src="https://res.cloudinary.com/dwqxdensk/image/upload/v1787947835/461451735_1057750859400196_1143453419980232675_n_nt27kp.png"
          alt="Estudio Jurídico Rozenblum"
          className="h-11 w-auto object-contain"
        />
        <h1
          className="text-2xl font-light tracking-wide hidden sm:block"
          style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}
        >
          Seleccionar Rol
        </h1>
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-sm font-medium transition-all duration-200 hover:opacity-60 underline underline-offset-2"
          style={{ color: "#173B6C" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Volver a Inicio
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-4xl">
          {/* Eyebrow */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
            <span className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: "#B58A43" }}>Aula Virtual</span>
            <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
          </div>

          <h2
            className="text-center mb-3"
            style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif", fontSize: "2.5rem", fontWeight: 300 }}
          >
            ¿Quién eres?
          </h2>
          <p className="text-center mb-16 text-base" style={{ color: "#173B6C", opacity: 0.75 }}>
            Selecciona tu rol para acceder al aula virtual
          </p>

          {/* Role cards */}
          <div className="grid sm:grid-cols-3 gap-8">
            {ROLES.map((role) => (
              <div
                key={role.key}
                onClick={() => setActiveRole(role)}
                className="group flex flex-col items-center text-center p-10 transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-2xl"
                style={{
                  backgroundColor: "#173B6C",
                  border: "3px solid #B58A43",
                  borderRadius: "8px",
                  minHeight: "280px",
                }}
              >
                {/* Icon circle */}
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundColor: "#B58A43", color: "#173B6C" }}
                >
                  {role.icon}
                </div>

                <h3
                  className="text-2xl font-medium mb-3"
                  style={{ color: "#FAF8F5", fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {role.title}
                </h3>

                <p className="text-sm leading-relaxed flex-1 mb-8" style={{ color: "rgba(250,248,245,0.85)" }}>
                  {role.desc}
                </p>

                <button
                  onClick={(e) => { e.stopPropagation(); setActiveRole(role); }}
                  className="w-full py-3 text-xs font-medium tracking-widest transition-all duration-200 hover:brightness-110 active:scale-95 mt-auto"
                  style={{ backgroundColor: "#B58A43", color: "#FAF8F5", letterSpacing: "0.12em", borderRadius: "4px" }}
                >
                  {role.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-5 px-8 text-center" style={{ backgroundColor: "#173B6C" }}>
        <p className="text-xs" style={{ color: "rgba(250,248,245,0.5)" }}>
          Términos de Servicio · Política de Privacidad · Soporte: soporte@estudio.com
        </p>
      </footer>

      {/* Login modal */}
      {activeRole && (
        <LoginModal
          role={activeRole}
          onClose={() => setActiveRole(null)}
          onLogin={(session) => { setActiveRole(null); router.push(`/${session.user.role}`); }}
        />
      )}
    </div>
  );
}
