"use client";

import { useState } from "react";
import type { AdminCursoDTO } from "@rozenblum/shared";
import { errorMessage } from "../../../lib/api";
import Modal from "../../../components/ui/Modal";
import Toast from "../../../components/ui/Toast";

type CursosSectionProps = {
  cursos: AdminCursoDTO[];
  onCreate: (input: { name: string; profesor: string; description: string; priceCents: number; duration: string; level: string; img?: string }) => Promise<void>;
  onToggleStatus: (curso: AdminCursoDTO) => Promise<void>;
  onDelete: (curso: AdminCursoDTO) => Promise<void>;
};
type ModalState = { type: "ver" | "crear"; item?: AdminCursoDTO } | null;

export default function CursosSection({ cursos, onCreate, onToggleStatus, onDelete }: CursosSectionProps) {
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState({ name: "", profesor: "", description: "", price: "", duration: "", level: "", img: "" });
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

  const toggleEstado = (c: AdminCursoDTO) =>
    run(async () => {
      await onToggleStatus(c);
      showToast(c.estado === "Publicado" ? "Curso despublicado" : "✓ Curso publicado");
    });

  const createCurso = () => {
    if (!form.name.trim() || !form.profesor.trim() || !form.description.trim() || !form.duration.trim() || !form.level.trim() || !form.price.trim() || Number(form.price) < 0) return;
    void run(async () => {
      await onCreate({
        name: form.name.trim(), profesor: form.profesor.trim(), description: form.description.trim(),
        priceCents: Math.round(Number(form.price) * 100), duration: form.duration.trim(),
        level: form.level.trim(), ...(form.img.trim() ? { img: form.img.trim() } : {}),
      });
      setModal(null);
      showToast("✓ Curso creado en borrador");
    });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-light" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Gestión de Cursos</h2>
        <button onClick={() => { setForm({ name: "", profesor: "", description: "", price: "", duration: "", level: "", img: "" }); setModal({ type: "crear" }); }} className="px-5 py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>
          + CREAR NUEVO CURSO
        </button>
      </div>
      <div className="rounded-lg overflow-hidden shadow-sm" style={{ border: "1px solid rgba(23,59,108,0.08)" }}>
        <table className="w-full text-xs">
          <thead><tr style={{ backgroundColor: "#173B6C" }}>
            {["Nombre", "Profesor", "Alumnos", "Completion %", "Estado", "Acciones"].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: "#FAF8F5" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {cursos.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs" style={{ color: "rgba(23,59,108,0.4)" }}>Todavía no hay cursos cargados</td></tr>
            ) : cursos.map((c, i) => (
              <tr key={c.id} style={{ backgroundColor: i % 2 === 0 ? "#FFFFFF" : "#F5F5F5" }}>
                <td className="px-4 py-3 font-medium" style={{ color: "#173B6C" }}>{c.name}</td>
                <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.65)" }}>{c.profesor}</td>
                <td className="px-4 py-3" style={{ color: "#173B6C" }}>{c.alumnos}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full" style={{ backgroundColor: "#E0E0E0" }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${c.completion}%`, backgroundColor: "#B58A43" }} />
                    </div>
                    <span style={{ color: "#173B6C" }}>{c.completion}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button disabled={busy} onClick={() => void toggleEstado(c)} className="px-2 py-0.5 rounded text-[10px] font-bold transition-opacity hover:opacity-70 disabled:opacity-40" style={c.estado === "Publicado" ? { backgroundColor: "#dcfce7", color: "#166534" } : { backgroundColor: "#fef3c7", color: "#92400e" }}>
                    {c.estado}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => showToast("Edición de curso disponible en producción")} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity" style={{ color: "#173B6C" }}>Editar</button>
                    <button onClick={() => setModal({ type: "ver", item: c })} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity" style={{ color: "#173B6C" }}>Ver</button>
                    <button disabled={busy} onClick={() => void run(async () => { await onDelete(c); showToast("Curso eliminado"); })} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity disabled:opacity-40" style={{ color: "#72132C" }}>Eliminar</button>
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
            {[["Profesor", modal.item.profesor], ["Alumnos", String(modal.item.alumnos)], ["Completion", `${modal.item.completion}%`], ["Estado", modal.item.estado]].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2" style={{ borderBottom: "1px solid rgba(23,59,108,0.06)" }}>
                <span className="text-xs" style={{ color: "rgba(23,59,108,0.55)" }}>{k}</span>
                <span className="text-xs font-semibold" style={{ color: "#173B6C" }}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setModal(null)} className="w-full py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>CERRAR</button>
        </Modal>
      )}

      {modal?.type === "crear" && (
        <Modal title="Crear Nuevo Curso" onClose={() => setModal(null)}>
          <div className="space-y-4 mb-5">
            {[["Nombre del curso", "name", "text"], ["Profesor asignado", "profesor", "text"], ["Descripción", "description", "text"], ["Precio en ARS", "price", "number"], ["Duración", "duration", "text"], ["Nivel", "level", "text"], ["URL de imagen (opcional)", "img", "url"]].map(([label, key, type]) => (
              <div key={key} className="flex flex-col gap-1.5">
                <label className="text-xs font-medium tracking-wide uppercase" style={{ color: "rgba(23,59,108,0.6)" }}>{label}</label>
                <input
                  autoFocus={key === "name"}
                  type={type}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="px-3 py-2.5 text-sm outline-none"
                  style={{ border: "1px solid rgba(23,59,108,0.2)", borderRadius: 4, color: "#173B6C", backgroundColor: "#FAF8F5" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#B58A43")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(23,59,108,0.2)")}
                />
              </div>
            ))}
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(23,59,108,0.5)" }}>
              Se crea como borrador. Revisá los datos antes de publicarlo.
            </p>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={createCurso} className="flex-1 py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all disabled:opacity-50" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>{busy ? "CREANDO..." : "CREAR"}</button>
            <button onClick={() => setModal(null)} className="flex-1 py-2.5 text-xs font-medium border hover:opacity-70 transition-opacity" style={{ color: "#173B6C", borderColor: "#173B6C" }}>CANCELAR</button>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.text} error={toast.error} />}
    </>
  );
}
