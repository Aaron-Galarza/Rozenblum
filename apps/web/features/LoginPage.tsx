"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SessionDTO } from "@rozenblum/shared";
import { apiFetch, errorMessage, saveSession } from "../lib/api";
import { loginDestination } from "../lib/login-destination";
import BrandLogo from "../components/ui/BrandLogo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    setSessionExpired(new URLSearchParams(window.location.search).get("session") === "expired");
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (!email || !password) { setError("Completá todos los campos."); return; }
    setError("");
    setLoading(true);
    try {
      const session = await apiFetch<SessionDTO>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      if (!session?.token || !session.user || !["alumno", "profesor", "admin"].includes(session.user.role)) {
        throw new Error("El servidor devolvió una sesión inválida.");
      }
      saveSession(session);
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(loginDestination(session.user.role, next, window.location.origin));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
      <header className="flex items-center justify-between gap-3 px-4 sm:px-8 py-5" style={{ borderBottom: "1px solid rgba(23,59,108,0.1)" }}>
        <BrandLogo className="h-11 max-w-[45%] w-auto object-contain" />
        <button type="button" onClick={() => router.push("/")} className="min-h-11 flex items-center gap-2 text-sm font-medium underline underline-offset-2" style={{ color: "#173B6C" }}>
          <span aria-hidden="true">←</span> Volver a Inicio
        </button>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
            <span className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: "#B58A43" }}>Aula Virtual</span>
            <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
          </div>
          <h1 className="text-center text-4xl font-light mb-3" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Iniciar sesión</h1>
          <p className="text-center text-sm mb-6" style={{ color: "rgba(23,59,108,0.75)" }}>Ingresá con tu correo y contraseña.</p>
          {sessionExpired && <p role="status" className="mb-6 text-center text-sm" style={{ color: "#72132C" }}>Tu sesión expiró. Volvé a ingresar para continuar.</p>}
          <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-5 sm:p-6" style={{ backgroundColor: "#FFFFFF", borderColor: "rgba(181,138,67,0.3)" }}>
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium mb-1.5" style={{ color: "#173B6C" }}>Correo electrónico</label>
              <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full min-h-11 rounded border px-3 py-2.5 text-base" style={{ borderColor: "rgba(23,59,108,0.2)", color: "#173B6C" }} />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium mb-1.5" style={{ color: "#173B6C" }}>Contraseña</label>
              <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full min-h-11 rounded border px-3 py-2.5 text-base" style={{ borderColor: "rgba(23,59,108,0.2)", color: "#173B6C" }} />
            </div>
            {error && <p role="alert" className="text-sm" style={{ color: "#72132C" }}>{error}</p>}
            <button type="submit" disabled={loading} className="w-full min-h-11 rounded py-3 text-xs font-bold tracking-widest transition-all hover:brightness-110 disabled:opacity-70" style={{ backgroundColor: "#173B6C", color: "#FAF8F5" }}>
              {loading ? "INGRESANDO..." : "INGRESAR"}
            </button>
          </form>
        </div>
      </main>
      <footer className="py-5 px-4 text-center" style={{ backgroundColor: "#173B6C" }}>
        <p className="text-xs" style={{ color: "rgba(250,248,245,0.5)" }}>
          © {new Date().getFullYear()} Estudio Jurídico Rozenblum ·{" "}
          <Link href="/terminos-y-condiciones" className="hover:underline">Términos de Servicio</Link> ·{" "}
          <Link href="/politica-de-privacidad" className="hover:underline">Política de Privacidad</Link>
        </p>
      </footer>
    </div>
  );
}
