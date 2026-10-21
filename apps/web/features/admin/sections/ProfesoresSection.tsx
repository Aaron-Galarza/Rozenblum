"use client";

import { useState } from "react";
import type { AdminProfesorDTO } from "@rozenblum/shared";
import { errorMessage } from "../../../lib/api";
import Modal from "../../../components/ui/Modal";
import Toast from "../../../components/ui/Toast";

const inputStyle: React.CSSProperties = { border: "1px solid rgba(23,59,108,0.2)", borderRadius: 4, color: "#173B6C", backgroundColor: "#FAF8F5" };

type ProfesoresSectionProps = {
  profesores: AdminProfesorDTO[];
  onCreate: (input: { name: string; email: string }) => Promise<void>;
  onUpdate: (id: string, patch: { name: string; email: string }) => Promise<void>;
  onToggleStatus: (profesor: AdminProfesorDTO) => Promise<void>;
  onDelete: (profesor: AdminProfesorDTO) => Promise<void>;
};
type ModalState = { type: "ver" | "editar" | "crear"; item?: AdminProfesorDTO } | null;

export default function ProfesoresSection({ profesores, onCreate, onUpdate, onToggleStatus, onDelete }: ProfesoresSectionProps) {
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState({ name: "", email: "" });
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

  const toggleSuspend = (p: AdminProfesorDTO) =>
    run(async () => {
      await onToggleStatus(p);
      showToast(p.estado === "Activo" ? `${p.name} suspendido` : `${p.name} reactivado`);
    });

  const saveEdit = () => {
    if (!modal?.item) return;
    const item = modal.item;
    void run(async () => {
      await onUpdate(item.id, { name: form.name, email: form.email });
      setModal(null);
      showToast("✓ Cambios guardados");
    });
  };

  const createProfesor = () => {
    if (!form.name.trim() || !form.email.trim()) return;
    void run(async () => {
      await onCreate({ name: form.name.trim(), email: form.email.trim() });
      setModal(null);
      showToast("✓ Profesor creado correctamente");
    });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-light" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Gestión de Profesores</h2>
        <button onClick={() => { setForm({ name: "", email: "" }); setModal({ type: "crear" }); }} className="px-5 py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>
          + CREAR NUEVO PROFESOR
        </button>
      </div>
      <div className="rounded-lg overflow-hidden shadow-sm" style={{ border: "1px solid rgba(23,59,108,0.08)" }}>
        <table className="w-full text-xs">
          <thead><tr style={{ backgroundColor: "#173B6C" }}>
            {["Nombre", "Email", "Cursos", "Alumnos", "Estado", "Acciones"].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: "#FAF8F5" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {profesores.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs" style={{ color: "rgba(23,59,108,0.4)" }}>Todavía no hay profesores cargados</td></tr>
            ) : profesores.map((p, i) => (
              <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? "#FFFFFF" : "#F5F5F5" }}>
                <td className="px-4 py-3 font-medium" style={{ color: "#173B6C" }}>{p.name}</td>
                <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.65)" }}>{p.email}</td>
                <td className="px-4 py-3" style={{ color: "#173B6C" }}>{p.cursos}</td>
                <td className="px-4 py-3" style={{ color: "#173B6C" }}>{p.alumnos}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={p.estado === "Activo" ? { backgroundColor: "#dcfce7", color: "#166534" } : { backgroundColor: "#fee2e2", color: "#991b1b" }}>
                    {p.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => setModal({ type: "ver", item: p })} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity" style={{ color: "#173B6C" }}>Ver</button>
                    <button disabled={busy} onClick={() => { setForm({ name: p.name, email: p.email }); setModal({ type: "editar", item: p }); }} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity disabled:opacity-40" style={{ color: "#173B6C" }}>Editar</button>
                    <button disabled={busy} onClick={() => void toggleSuspend(p)} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity disabled:opacity-40" style={{ color: "#173B6C" }}>{p.estado === "Activo" ? "Suspender" : "Activar"}</button>
                    <button disabled={busy} onClick={() => void run(async () => { await onDelete(p); showToast("Profesor eliminado"); })} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity disabled:opacity-40" style={{ color: "#72132C" }}>Eliminar</button>
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
            {[["Email", modal.item.email], ["Cursos", String(modal.item.cursos)], ["Alumnos", String(modal.item.alumnos)], ["Estado", modal.item.estado]].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2" style={{ borderBottom: "1px solid rgba(23,59,108,0.06)" }}>
                <span className="text-xs" style={{ color: "rgba(23,59,108,0.55)" }}>{k}</span>
                <span className="text-xs font-semibold" style={{ color: "#173B6C" }}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setModal(null)} className="w-full py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>CERRAR</button>
        </Modal>
      )}

      {(modal?.type === "editar" || modal?.type === "crear") && (
        <Modal title={modal.type === "crear" ? "Crear Nuevo Profesor" : "Editar Profesor"} onClose={() => setModal(null)}>
          <div className="space-y-4 mb-5">
            {[["Nombre completo", "name", "text"], ["Email", "email", "email"]].map(([label, key, type]) => (
              <div key={key} className="flex flex-col gap-1.5">
                <label className="text-xs font-medium tracking-wide uppercase" style={{ color: "rgba(23,59,108,0.6)" }}>{label}</label>
                <input
                  autoFocus={key === "name"}
                  type={type}
                  value={form[key as "name" | "email"]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="px-3 py-2.5 text-sm outline-none"
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#B58A43")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(23,59,108,0.2)")}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={modal.type === "crear" ? createProfesor : saveEdit} className="flex-1 py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all disabled:opacity-50" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>
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
