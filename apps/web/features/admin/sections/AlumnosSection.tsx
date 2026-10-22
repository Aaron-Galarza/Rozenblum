"use client";

import { useState } from "react";
import type { AdminAlumnoDTO } from "@rozenblum/shared";
import { errorMessage } from "../../../lib/api";
import Modal from "../../../components/ui/Modal";
import Toast from "../../../components/ui/Toast";

const inputStyle: React.CSSProperties = { border: "1px solid rgba(23,59,108,0.2)", borderRadius: 4, color: "#173B6C", backgroundColor: "#FAF8F5" };

type AlumnosSectionProps = {
  alumnos: AdminAlumnoDTO[];
  onCreate: (input: { name: string; email: string; password: string }) => Promise<void>;
  onUpdate: (id: string, patch: { name: string; email: string; password?: string }) => Promise<void>;
  onToggleStatus: (alumno: AdminAlumnoDTO) => Promise<void>;
  onDelete: (alumno: AdminAlumnoDTO) => Promise<void>;
};
type ModalState = { type: "ver" | "editar" | "crear"; item?: AdminAlumnoDTO } | null;

export default function AlumnosSection({ alumnos, onCreate, onUpdate, onToggleStatus, onDelete }: AlumnosSectionProps) {
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("Todos");
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const showToast = (text: string, error = false) => { setToast({ text, error }); setTimeout(() => setToast(null), 2500); };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      showToast(errorMessage(err), true);
    } finally {
      setBusy(false);
    }
  };

  const filtered = alumnos.filter((a) => {
    const matchSearch = a.name.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase());
    const matchEstado = estadoFilter === "Todos" || a.estado === estadoFilter;
    return matchSearch && matchEstado;
  });

  const toggleSuspend = (a: AdminAlumnoDTO) =>
    run(async () => {
      await onToggleStatus(a);
      showToast(a.estado === "Activo" ? `${a.name} suspendido` : `${a.name} reactivado`);
    });

  const createAlumno = () => {
    if (form.name.trim().length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.password.length < 12) {
      showToast("Ingresá nombre, correo válido y una contraseña de al menos 12 caracteres.", true);
      return;
    }
    void run(async () => {
      await onCreate({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      setModal(null);
      showToast("✓ Alumno creado correctamente");
    });
  };

  const saveEdit = () => {
    if (!modal?.item) return;
    if (form.name.trim().length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || (form.password && form.password.length < 12)) {
      showToast("Revisá nombre, correo y contraseña (mínimo 12 caracteres si la cambiás).", true);
      return;
    }
    const item = modal.item;
    void run(async () => {
      await onUpdate(item.id, { name: form.name, email: form.email, ...(form.password ? { password: form.password } : {}) });
      setModal(null);
      showToast("✓ Cambios guardados");
    });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-3xl font-light" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Gestión de Alumnos</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setForm({ name: "", email: "", password: "" }); setModal({ type: "crear" }); }} className="px-5 py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>
            + CREAR NUEVO ALUMNO
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select aria-label="Filtrar alumnos por estado" value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} className="px-3 py-2 text-xs outline-none" style={{ border: "1px solid rgba(23,59,108,0.2)", color: "#173B6C", backgroundColor: "#FAF8F5" }}>
          <option value="Todos">Por Estado ▼</option>
          <option value="Activo">Activo</option>
          <option value="Suspendido">Suspendido</option>
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Buscar alumno..."
          className="px-3 py-2 text-xs outline-none"
          style={{ border: "1px solid rgba(23,59,108,0.2)", color: "#173B6C", backgroundColor: "#FAF8F5", minWidth: 180 }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#B58A43")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(23,59,108,0.2)")}
        />
        {(search || estadoFilter !== "Todos") && (
          <button onClick={() => { setSearch(""); setEstadoFilter("Todos"); }} className="text-xs underline hover:opacity-60 transition-opacity" style={{ color: "#B58A43" }}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="rounded-lg overflow-hidden shadow-sm" style={{ border: "1px solid rgba(23,59,108,0.08)" }}>
        <table className="w-full text-xs">
          <thead><tr style={{ backgroundColor: "#173B6C" }}>
            {["Nombre", "Email", "Cursos", "Progreso", "Inscripción", "Estado", "Acciones"].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: "#FAF8F5" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs" style={{ color: "rgba(23,59,108,0.4)" }}>No se encontraron alumnos</td></tr>
            ) : filtered.map((a, i) => (
              <tr key={a.id} style={{ backgroundColor: i % 2 === 0 ? "#FFFFFF" : "#F5F5F5" }}>
                <td className="px-4 py-3 font-medium" style={{ color: "#173B6C" }}>{a.name}</td>
                <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.65)" }}>{a.email}</td>
                <td className="px-4 py-3" style={{ color: "#173B6C" }}>{a.cursos}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full" style={{ backgroundColor: "#E0E0E0" }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${a.progress}%`, backgroundColor: "#B58A43" }} />
                    </div>
                    <span style={{ color: "#173B6C" }}>{a.progress}%</span>
                  </div>
                </td>
                <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.6)" }}>{a.fecha}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={a.estado === "Activo" ? { backgroundColor: "#dcfce7", color: "#166534" } : { backgroundColor: "#fee2e2", color: "#991b1b" }}>
                    {a.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => setModal({ type: "ver", item: a })} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity" style={{ color: "#173B6C" }}>Ver</button>
                    <button disabled={busy} onClick={() => { setForm({ name: a.name, email: a.email, password: "" }); setModal({ type: "editar", item: a }); }} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity disabled:opacity-40" style={{ color: "#173B6C" }}>Editar</button>
                    <button disabled={busy} onClick={() => void toggleSuspend(a)} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity disabled:opacity-40" style={{ color: "#173B6C" }}>{a.estado === "Activo" ? "Suspender" : "Activar"}</button>
                    <button disabled={busy} onClick={() => { if (window.confirm(`¿Eliminar a ${a.name} y sus inscripciones?`)) void run(async () => { await onDelete(a); showToast("Alumno eliminado"); }); }} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity disabled:opacity-40" style={{ color: "#72132C" }}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.type === "ver" && modal.item && (
        <Modal title={modal.item.name} onClose={() => setModal(null)}>
          <div className="space-y-2 mb-5">
            {[["Email", modal.item.email], ["Cursos", String(modal.item.cursos)], ["Progreso", `${modal.item.progress}%`], ["Inscripción", modal.item.fecha], ["Estado", modal.item.estado]].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2" style={{ borderBottom: "1px solid rgba(23,59,108,0.06)" }}>
                <span className="text-xs" style={{ color: "rgba(23,59,108,0.55)" }}>{k}</span>
                <span className="text-xs font-semibold" style={{ color: "#173B6C" }}>{v}</span>
              </div>
            ))}
            <div className="pt-2">
              <p className="text-xs mb-1" style={{ color: "rgba(23,59,108,0.55)" }}>Progreso del curso</p>
              <div className="w-full h-2 rounded-full" style={{ backgroundColor: "#E0E0E0" }}>
                <div className="h-2 rounded-full" style={{ width: `${modal.item.progress}%`, backgroundColor: "#B58A43" }} />
              </div>
            </div>
          </div>
          <button onClick={() => setModal(null)} className="w-full py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>CERRAR</button>
        </Modal>
      )}

      {(modal?.type === "editar" || modal?.type === "crear") && (
        <Modal title={modal.type === "crear" ? "Crear Nuevo Alumno" : "Editar Alumno"} onClose={() => setModal(null)}>
          <div className="space-y-4 mb-5">
            {[["Nombre completo", "name", "text"], ["Email", "email", "email"]].map(([label, key, type]) => (
              <div key={key} className="flex flex-col gap-1.5">
                <label htmlFor={`alumno-${key}`} className="text-xs font-medium tracking-wide uppercase" style={{ color: "rgba(23,59,108,0.6)" }}>{label}</label>
                <input
                  id={`alumno-${key}`}
                  autoFocus={key === "name"}
                  type={type}
                  readOnly={modal.type === "editar" && key === "email"}
                  value={form[key as "name" | "email"]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="px-3 py-2.5 text-sm outline-none"
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#B58A43")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(23,59,108,0.2)")}
                />
                {modal.type === "editar" && key === "email" && <p className="text-xs" style={{ color: "rgba(23,59,108,0.55)" }}>El correo identifica las inscripciones y no se puede cambiar.</p>}
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="alumno-password" className="text-xs font-medium tracking-wide uppercase" style={{ color: "rgba(23,59,108,0.6)" }}>Contraseña {modal.type === "crear" ? "(mínimo 12 caracteres)" : "nueva (opcional)"}</label>
              <input id="alumno-password" type="password" autoComplete="new-password" minLength={12} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="px-3 py-2.5 text-sm outline-none" style={inputStyle} />
            </div>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={modal.type === "crear" ? createAlumno : saveEdit} className="flex-1 py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all disabled:opacity-50" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>
              {busy ? "GUARDANDO..." : modal.type === "crear" ? "CREAR" : "GUARDAR"}
            </button>
            <button onClick={() => setModal(null)} className="flex-1 py-2.5 text-xs font-medium border hover:opacity-70 transition-opacity" style={{ color: "#173B6C", borderColor: "#173B6C" }}>CANCELAR</button>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.text} error={toast.error} />}
    </>
  );
}
