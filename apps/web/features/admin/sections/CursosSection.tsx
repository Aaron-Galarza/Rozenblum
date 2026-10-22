"use client";

import { useState } from "react";
import type { AdminCursoDTO, AdminProfesorDTO, CourseDTO } from "@rozenblum/shared";
import { errorMessage } from "../../../lib/api";
import Modal from "../../../components/ui/Modal";
import Toast from "../../../components/ui/Toast";

type CursosSectionProps = {
  cursos: AdminCursoDTO[];
  profesores: AdminProfesorDTO[];
  onCreate: (input: { name: string; profesor: string; description: string; priceCents: number; duration: string; level: string; img?: string }) => Promise<void>;
  onLoadCourse: (id: number) => Promise<CourseDTO>;
  onUpdate: (id: number, patch: { title: string; professor: string; description: string; priceCents: number; duration: string; level: string; img?: string }) => Promise<void>;
  onToggleStatus: (curso: AdminCursoDTO) => Promise<void>;
  onDelete: (curso: AdminCursoDTO) => Promise<void>;
};
type ModalState = { type: "ver" | "crear" | "editar"; item?: AdminCursoDTO } | null;

export default function CursosSection({ cursos, profesores, onCreate, onLoadCourse, onUpdate, onToggleStatus, onDelete }: CursosSectionProps) {
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState({ name: "", profesor: "", description: "", price: "", duration: "", level: "", img: "" });
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

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

  const saveCurso = () => {
    const price = Number(form.price);
    if (form.name.trim().length < 3 || form.description.trim().length < 3 || !form.profesor || !form.duration.trim() || !form.level.trim() || !Number.isFinite(price) || price < 0 || !Number.isInteger(price * 100)) {
      setFormError("Completá todos los campos con datos válidos. El precio debe ser positivo y tener hasta dos decimales.");
      return;
    }
    if (form.img.trim() && !/^https?:\/\//i.test(form.img.trim())) {
      setFormError("La imagen debe tener una URL http(s) válida.");
      return;
    }
    setFormError("");
    void run(async () => {
      const input = {
        name: form.name.trim(), profesor: form.profesor.trim(), description: form.description.trim(),
        priceCents: Math.round(price * 100), duration: form.duration.trim(),
        level: form.level.trim(), ...(form.img.trim() ? { img: form.img.trim() } : {}),
      };
      if (modal?.type === "editar" && modal.item) {
        await onUpdate(modal.item.id, { title: input.name, professor: input.profesor, description: input.description, priceCents: input.priceCents, duration: input.duration, level: input.level, ...(input.img ? { img: input.img } : {}) });
      } else {
        await onCreate(input);
      }
      setModal(null);
      showToast(modal?.type === "editar" ? "✓ Curso actualizado" : "✓ Curso creado en borrador");
    });
  };

  const editCurso = (curso: AdminCursoDTO) => {
    void run(async () => {
      const full = await onLoadCourse(curso.id);
      setForm({
        name: full.title,
        profesor: profesores.find((p) => p.email === full.professorId)?.name ?? "",
        description: full.description,
        price: String(full.priceCents / 100),
        duration: full.duration,
        level: full.level,
        img: full.img,
      });
      setFormError("");
      setModal({ type: "editar", item: curso });
    });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-light" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Gestión de Cursos</h2>
        <button onClick={() => { setForm({ name: "", profesor: "", description: "", price: "", duration: "", level: "", img: "" }); setFormError(""); setModal({ type: "crear" }); }} className="px-5 py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>
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
                    <button disabled={busy} onClick={() => editCurso(c)} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity disabled:opacity-40" style={{ color: "#173B6C" }}>Editar</button>
                    <button onClick={() => setModal({ type: "ver", item: c })} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity" style={{ color: "#173B6C" }}>Ver</button>
                    <button disabled={busy} onClick={() => { if (window.confirm(`¿Eliminar el curso ${c.name}? Esta acción no se puede deshacer.`)) void run(async () => { await onDelete(c); showToast("Curso eliminado"); }); }} className="text-xs underline underline-offset-1 hover:opacity-50 transition-opacity disabled:opacity-40" style={{ color: "#72132C" }}>Eliminar</button>
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

      {(modal?.type === "crear" || modal?.type === "editar") && (
        <Modal title={modal.type === "crear" ? "Crear Nuevo Curso" : "Editar Curso"} onClose={() => setModal(null)}>
          <div className="space-y-4 mb-5">
            {[["Nombre del curso", "name", "text"], ["Descripción", "description", "text"], ["Precio en ARS", "price", "number"], ["Duración", "duration", "text"], ["Nivel", "level", "text"], ["URL de imagen (opcional)", "img", "url"]].map(([label, key, type]) => (
              <div key={key} className="flex flex-col gap-1.5">
                <label htmlFor={`course-${key}`} className="text-xs font-medium tracking-wide uppercase" style={{ color: "rgba(23,59,108,0.6)" }}>{label}</label>
                <input
                  id={`course-${key}`}
                  autoFocus={key === "name"}
                  type={type}
                  min={key === "price" ? 0 : undefined}
                  step={key === "price" ? "0.01" : undefined}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="px-3 py-2.5 text-sm outline-none"
                  style={{ border: "1px solid rgba(23,59,108,0.2)", borderRadius: 4, color: "#173B6C", backgroundColor: "#FAF8F5" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#B58A43")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(23,59,108,0.2)")}
                />
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="course-profesor" className="text-xs font-medium tracking-wide uppercase" style={{ color: "rgba(23,59,108,0.6)" }}>Profesor asignado</label>
              <select id="course-profesor" value={form.profesor} onChange={(e) => setForm((prev) => ({ ...prev, profesor: e.target.value }))} className="px-3 py-2.5 text-sm border" style={{ color: "#173B6C", backgroundColor: "#FAF8F5" }}>
                <option value="">Seleccioná un profesor</option>
                {profesores.filter((p) => p.estado === "Activo" || p.name === form.profesor).map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            {formError && <p role="alert" className="text-xs" style={{ color: "#991b1b" }}>{formError}</p>}
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(23,59,108,0.5)" }}>
              {modal.type === "crear" ? "Se crea como borrador. Agregá lecciones antes de publicarlo." : "Los cambios se aplicarán al curso existente."}
            </p>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={saveCurso} className="flex-1 py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all disabled:opacity-50" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>{busy ? "GUARDANDO..." : modal.type === "crear" ? "CREAR" : "GUARDAR"}</button>
            <button onClick={() => setModal(null)} className="flex-1 py-2.5 text-xs font-medium border hover:opacity-70 transition-opacity" style={{ color: "#173B6C", borderColor: "#173B6C" }}>CANCELAR</button>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.text} error={toast.error} />}
    </>
  );
}
