"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminOverviewDTO, CourseDTO, CourseDetailDTO, OrderStatus } from "@rozenblum/shared";
import type { AdminSection } from "../../types";
import { NAV_ITEMS } from "./nav";
import { usePublicSettings } from "../../lib/use-public-settings";
import SimpleFooter from "../../components/layout/SimpleFooter";
import { apiFetch, clearSession, errorMessage } from "../../lib/api";
import { useSession } from "../../lib/use-session";
import { ErrorPanel, LoadingScreen } from "../../components/ui/AsyncState";
import DashboardSection from "./sections/DashboardSection";
import ProfesoresSection from "./sections/ProfesoresSection";
import AlumnosSection from "./sections/AlumnosSection";
import CursosSection from "./sections/CursosSection";
import PagosSection from "./sections/PagosSection";
import ConsultasSection from "./sections/ConsultasSection";
import ReportesSection from "./sections/ReportesSection";
import ConfigSection from "./sections/ConfigSection";

export default function AdminView() {
  const settings = usePublicSettings();
  const router = useRouter();
  const { session, ready } = useSession("admin");
  const [section, setSection] = useState<AdminSection>("dashboard");
  const [tableTab, setTableTab] = useState<"ordenes" | "inscripciones">("ordenes");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [overview, setOverview] = useState<AdminOverviewDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setOverview(await apiFetch<AdminOverviewDTO>("/api/admin/overview", { auth: true }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [ready, load]);

  const pageTitle = NAV_ITEMS.find((n) => n.key === section)?.label ?? "Dashboard";
  const notificationCount = overview?.dashboard.nuevasInscripciones ?? 0;

  const logout = () => {
    clearSession();
    router.push("/");
  };

  if (!ready) return <LoadingScreen label="Verificando sesión..." />;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
      {/* ── HEADER ── */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 h-[70px] z-40" style={{ backgroundColor: "#FAF8F5", borderBottom: "2px solid #B58A43" }}>
        <button onClick={() => router.push("/")} className="flex items-center gap-3">
          {settings?.logoUrl && <img src={settings.logoUrl} alt={settings.companyName} className="h-9 w-auto object-contain" />}
        </button>
        <h1 className="text-lg font-medium hidden sm:block" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{pageTitle}</h1>
        <div className="flex items-center gap-4">
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="#173B6C" strokeWidth="1.5" className="w-6 h-6" aria-hidden="true"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
            {notificationCount > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: "#B58A43", color: "#FAF8F5" }}>{notificationCount}</div>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "#173B6C", color: "#B58A43" }}>{session?.user.initials ?? "AD"}</div>
              <span className="hidden sm:block text-xs" style={{ color: "#173B6C" }}>{session?.user.name ?? "Admin"}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="#173B6C" strokeWidth="2" className="w-4 h-4"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-12 w-40 z-50 shadow-xl" style={{ backgroundColor: "#FAF8F5", border: "1px solid rgba(23,59,108,0.15)" }}>
                <button onClick={logout} className="block w-full text-left px-4 py-2.5 text-xs font-medium" style={{ color: "#B58A43" }}>Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── SIDEBAR ── */}
        <aside className="w-60 flex-shrink-0 overflow-y-auto" style={{ backgroundColor: "#173B6C" }}>
          <div className="py-6">
            {NAV_ITEMS.map(({ key, label, emoji }) => (
              <button
                key={key}
                onClick={() => setSection(key)}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-sm text-left transition-all duration-150"
                style={{
                  color: section === key ? "#B58A43" : "rgba(250,248,245,0.65)",
                  backgroundColor: section === key ? "rgba(255,255,255,0.08)" : "transparent",
                  borderLeft: section === key ? "4px solid #B58A43" : "4px solid transparent",
                  fontFamily: "'Roboto', sans-serif",
                }}
              >
                <span>{emoji}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <LoadingScreen label="Cargando panel..." />
          ) : error && !overview ? (
            <ErrorPanel message={error} onRetry={() => { setLoading(true); void load().finally(() => setLoading(false)); }} />
          ) : overview ? (
            <>
              {error && (
                <div className="mb-5 px-4 py-2.5 text-xs rounded" style={{ backgroundColor: "#fee2e2", color: "#991b1b", border: "1px solid rgba(153,27,27,0.25)" }}>
                  {error}
                </div>
              )}
              {section === "dashboard" && (
                <DashboardSection
                  dashboard={overview.dashboard}
                  tableTab={tableTab}
                  onTableTabChange={setTableTab}
                />
              )}
              {section === "profesores" && (
                <ProfesoresSection
                  profesores={overview.profesores}
                  onCreate={async ({ name, email, password }) => {
                    await apiFetch("/api/admin/users", { method: "POST", auth: true, body: { role: "profesor", name, email, password } });
                    await load();
                  }}
                  onUpdate={async (id, patch) => {
                    await apiFetch(`/api/admin/users/${id}`, { method: "PATCH", auth: true, body: patch });
                    await load();
                  }}
                  onToggleStatus={async (profesor) => {
                    await apiFetch(`/api/admin/users/${profesor.id}`, { method: "PATCH", auth: true, body: { status: profesor.estado === "Activo" ? "Suspendido" : "Activo" } });
                    await load();
                  }}
                  onDelete={async (profesor) => {
                    await apiFetch(`/api/admin/users/${profesor.id}`, { method: "DELETE", auth: true });
                    await load();
                  }}
                />
              )}
              {section === "alumnos" && (
                <AlumnosSection
                  alumnos={overview.alumnos}
                  onCreate={async ({ name, email, password }) => {
                    await apiFetch("/api/admin/users", { method: "POST", auth: true, body: { role: "alumno", name, email, password } });
                    await load();
                  }}
                  onUpdate={async (id, patch) => {
                    await apiFetch(`/api/admin/users/${id}`, { method: "PATCH", auth: true, body: patch });
                    await load();
                  }}
                  onToggleStatus={async (alumno) => {
                    await apiFetch(`/api/admin/users/${alumno.id}`, { method: "PATCH", auth: true, body: { status: alumno.estado === "Activo" ? "Suspendido" : "Activo" } });
                    await load();
                  }}
                  onDelete={async (alumno) => {
                    await apiFetch(`/api/admin/users/${alumno.id}`, { method: "DELETE", auth: true });
                    await load();
                  }}
                />
              )}
              {section === "cursos" && (
                <CursosSection
                  cursos={overview.cursos}
                  profesores={overview.profesores}
                  onCreate={async ({ name, profesor, description, priceCents, duration, level, img }) => {
                    await apiFetch("/api/admin/courses", {
                      method: "POST",
                      auth: true,
                      body: {
                        title: name,
                        professor: profesor,
                        description,
                        status: "draft",
                        priceCents,
                        duration,
                        level,
                        ...(img ? { img } : {}),
                      },
                    });
                    await load();
                  }}
                  onToggleStatus={async (curso) => {
                    await apiFetch(`/api/admin/courses/${curso.id}`, { method: "PATCH", auth: true, body: { status: curso.estado === "Publicado" ? "draft" : "published" } });
                    await load();
                  }}
                  onLoadCourse={async (id) => (await apiFetch<CourseDetailDTO>(`/api/teacher/courses/${id}`, { auth: true })).course}
                  onUpdate={async (id, patch) => {
                    await apiFetch<CourseDTO>(`/api/admin/courses/${id}`, { method: "PATCH", auth: true, body: patch });
                    await load();
                  }}
                  onDelete={async (curso) => {
                    await apiFetch(`/api/admin/courses/${curso.id}`, { method: "DELETE", auth: true });
                    await load();
                  }}
                />
              )}
              {section === "pagos" && (
                <PagosSection
                  orders={overview.orders}
                  onStatusChange={async (id: string, estado: OrderStatus) => {
                    await apiFetch(`/api/admin/orders/${id}`, { method: "PATCH", auth: true, body: { estado } });
                    await load();
                  }}
                />
              )}
              {section === "consultas" && <ConsultasSection />}
              {section === "reportes" && <ReportesSection reportes={overview.reportes} />}
              {section === "config" && (
                <ConfigSection
                  settings={overview.settings}
                  onSave={async (input) => {
                    await apiFetch("/api/admin/settings", { method: "PUT", auth: true, body: input });
                    await load();
                  }}
                />
              )}
            </>
          ) : null}
        </main>
      </div>

      <SimpleFooter />
    </div>
  );
}
