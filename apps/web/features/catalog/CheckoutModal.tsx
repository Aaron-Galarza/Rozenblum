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
  const [form, setForm] = useState({ nombre: "", email: "", dni: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.email || !form.dni) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<CheckoutResultDTO>("/api/checkout", {
        method: "POST",
        body: {
          courseSlug: course.slug ?? String(course.id),
          nombre: form.nombre,
          email: form.email,
          dni: form.dni,
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
            { id: "dni", label: "DNI / Documento de Identidad *", type: "text", placeholder: "28.123.456" },
          ].map(({ id, label, type, placeholder }) => (
            <div key={id} className="flex flex-col gap-1.5">
              <label htmlFor={id} className="text-xs font-medium tracking-widest uppercase" style={{ color: "rgba(23,59,108,0.6)" }}>{label}</label>
              <input
                id={id}
                required
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

          {/* Payment method */}
          <div className="p-4 rounded" style={{ backgroundColor: "#F5F5F5" }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: "#173B6C" }}>Medio de Pago</p>
            <div className="flex items-center gap-3 p-3 rounded" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E0E0E0" }}>
              {/* MercadoPago logo placeholder */}
              <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ backgroundColor: "#009EE3" }}>
                <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                </svg>
                <span className="text-xs font-bold text-white tracking-wide">Mercado Pago</span>
              </div>
              <p className="text-xs" style={{ color: "rgba(23,59,108,0.6)" }}>Pago seguro · Tarjetas y transferencias</p>
            </div>
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
            {loading ? "PROCESANDO..." : "PAGAR CON MERCADO PAGO"}
          </button>

          <p className="text-[11px] leading-relaxed text-center" style={{ color: "rgba(23,59,108,0.55)" }}>
            El acceso se habilita cuando un administrador valida el pago. No se cobra en esta versión demo.
          </p>
        </form>
      </div>
    </div>
  );
}
