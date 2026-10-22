"use client";

import { useId, useState } from "react";
import type { CheckoutResultDTO } from "@rozenblum/shared";
import type { Course } from "../../types";
import { apiFetch, errorMessage } from "../../lib/api";
import { useModalA11y } from "../../lib/use-modal-a11y";

type CheckoutModalProps = {
  course: Course;
  onClose: () => void;
  onSuccess: (reference: string, email: string) => void;
};

export default function CheckoutModal({ course, onClose, onSuccess }: CheckoutModalProps) {
  const titleId = useId();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [form, setForm] = useState({ nombre: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.email || !form.password) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<CheckoutResultDTO>("/api/checkout", {
        method: "POST",
        body: {
          courseSlug: course.slug ?? String(course.id),
          nombre: form.nombre,
          email: form.email,
          password: form.password,
        },
      });
      onSuccess(result.order.externalReference ?? result.order.id, form.email);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", overflowY: "auto", padding: "1.5rem 1rem" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-lg outline-none"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 24px 80px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-6" style={{ borderBottom: "1px solid rgba(23,59,108,0.1)" }}>
          <h2 id={titleId} className="text-3xl font-light" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>
            Inscripción al Curso
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:opacity-50 transition-opacity"
            style={{ color: "#173B6C" }}
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          {/* Course summary */}
          <div className="flex items-center gap-3 p-4 rounded" style={{ backgroundColor: "rgba(23,59,108,0.04)", border: "1px solid rgba(23,59,108,0.08)" }}>
            <div className="flex-1">
              <p className="text-xs tracking-widest uppercase font-medium mb-0.5" style={{ color: "#B58A43" }}>Inscribiéndote a</p>
              <p className="text-base font-medium" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{course.title}</p>
            </div>
            <p className="text-2xl font-light" style={{ color: "#B58A43", fontFamily: "'Cormorant Garamond', serif" }}>{course.price}</p>
          </div>

          {/* Form fields */}
          {[
            { id: "nombre", label: "Nombre y Apellido *", type: "text", placeholder: "Juan García" },
            { id: "email", label: "Correo Electrónico *", type: "email", placeholder: "juan@email.com" },
            { id: "password", label: "Contraseña de tu cuenta o nueva contraseña *", type: "password", placeholder: "Mínimo 12 caracteres" },
          ].map(({ id, label, type, placeholder }) => (
            <div key={id} className="flex flex-col gap-1.5">
              <label htmlFor={id} className="text-xs font-medium tracking-widest uppercase" style={{ color: "rgba(23,59,108,0.6)" }}>{label}</label>
              <input
                id={id}
                required
                maxLength={id === "nombre" ? 120 : id === "password" ? 128 : undefined}
                minLength={id === "password" ? 12 : id === "nombre" ? 3 : undefined}
                type={type}
                placeholder={placeholder}
                value={form[id as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [id]: e.target.value })}
                className="w-full px-4 py-3 text-sm outline-none transition-all duration-200"
                style={{ border: "1px solid #E0E0E0", color: "#173B6C", fontFamily: "'Roboto', sans-serif", borderRadius: "4px" }}
                onFocus={(e) => (e.target.style.border = "2px solid #B58A43")}
                onBlur={(e) => (e.target.style.border = "1px solid #E0E0E0")}
              />
            </div>
          ))}

          {/* Registration status */}
          <div className="p-4 rounded" style={{ backgroundColor: "#F5F5F5" }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#173B6C" }}>Solicitud de inscripción</p>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(23,59,108,0.7)" }}>Si ya tenés cuenta, ingresá su contraseña. Si es tu primera inscripción, se creará una cuenta con la contraseña que elijas. No se realiza ningún cobro en este sitio; consultá las instrucciones de pago por WhatsApp al finalizar.</p>
          </div>

          {error && (
            <p className="text-xs leading-relaxed" style={{ color: "#72132C" }} role="alert">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 text-sm font-bold tracking-widest transition-all duration-200 hover:brightness-110 active:scale-95 rounded disabled:opacity-70"
            style={{ backgroundColor: "#009EE3", color: "#FFFFFF", letterSpacing: "0.1em" }}
          >
            {loading ? "REGISTRANDO..." : "SOLICITAR INSCRIPCIÓN"}
          </button>

          <p className="text-[11px] leading-relaxed text-center" style={{ color: "rgba(23,59,108,0.55)" }}>
            El acceso se habilita cuando un administrador confirma tu inscripción.
          </p>
        </form>
      </div>
    </div>
  );
}
