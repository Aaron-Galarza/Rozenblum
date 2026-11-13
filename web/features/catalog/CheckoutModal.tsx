"use client";

import { useId, useState } from "react";
import type { CheckoutResultDTO } from "@rozenblum/shared";
import type { Course } from "../../types";
import { apiFetch, errorMessage } from "../../lib/api";
import { useModalA11y } from "../../lib/use-modal-a11y";
import { safeHttpUrl } from "../../lib/safe-url";

type CheckoutModalProps = {
  course: Course;
  onClose: () => void;
};

export default function CheckoutModal({ course, onClose }: CheckoutModalProps) {
  const titleId = useId();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [form, setForm] = useState({ nombre: "", email: "", dni: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.email || !/^\d{7,8}$/.test(form.dni)) return;
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
      const paymentUrl = safeHttpUrl(result.payment.url);
      if (!paymentUrl) throw new Error("Mercado Pago devolvió un enlace inválido. Volvé a intentarlo.");
      sessionStorage.setItem(`rozenblum-payment-email:${result.order.externalReference ?? result.order.id}`, form.email);
      window.location.assign(paymentUrl);
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
          <div className="flex flex-wrap items-center gap-3 rounded p-4" style={{ backgroundColor: "#FAF8F5", border: "1px solid rgba(181,138,67,0.25)" }}>
            <div className="min-w-0 flex-1">
              <p className="text-xs tracking-widest uppercase font-medium mb-0.5" style={{ color: "#B58A43" }}>Inscribiéndote a</p>
              <p className="text-base font-medium" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{course.title}</p>
            </div>
            <p className="text-2xl font-light" style={{ color: "#B58A43", fontFamily: "'Cormorant Garamond', serif" }}>{course.price}</p>
          </div>

          {/* Form fields */}
          {[
            { id: "nombre", label: "Nombre y Apellido *", type: "text", placeholder: "Juan García" },
            { id: "email", label: "Correo Electrónico *", type: "email", placeholder: "juan@email.com" },
            { id: "dni", label: "DNI *", type: "text", placeholder: "Sin puntos, 7 u 8 dígitos" },
          ].map(({ id, label, type, placeholder }) => (
            <div key={id} className="flex flex-col gap-1.5">
              <label htmlFor={id} className="text-xs font-medium tracking-widest uppercase" style={{ color: "rgba(23,59,108,0.6)" }}>{label}</label>
              <input
                id={id}
                required
                maxLength={id === "nombre" ? 120 : id === "dni" ? 8 : undefined}
                minLength={id === "dni" ? 7 : id === "nombre" ? 3 : undefined}
                pattern={id === "dni" ? "\\d{7,8}" : undefined}
                inputMode={id === "dni" ? "numeric" : undefined}
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
          <div className="rounded border-l-2 p-4" style={{ backgroundColor: "#FAF8F5", borderColor: "#B58A43" }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#173B6C" }}>Solicitud de inscripción</p>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(23,59,108,0.7)" }}>Tu DNI será la contraseña inicial de tu cuenta. Al continuar, irás a Mercado Pago. La cuenta y el acceso al aula se habilitarán cuando se confirme el pago.</p>
          </div>

          {error && (
            <p className="text-xs leading-relaxed" style={{ color: "#72132C" }} role="alert">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="group flex min-h-14 w-full items-center justify-center gap-3 rounded-sm border px-5 py-4 text-xs font-bold tracking-widest transition-all duration-200 hover:brightness-125 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
            style={{ backgroundColor: "#173B6C", borderColor: "#B58A43", color: "#FAF8F5", letterSpacing: "0.1em" }}
          >
            {loading ? "REGISTRANDO..." : "CONTINUAR A MERCADO PAGO"}
            {!loading && <span aria-hidden="true" className="text-base transition-transform duration-200 group-hover:translate-x-1" style={{ color: "#D4A855" }}>→</span>}
          </button>

          <p className="text-[11px] leading-relaxed text-center" style={{ color: "rgba(23,59,108,0.55)" }}>
            El acceso se habilita cuando se confirma el pago.
          </p>
        </form>
      </div>
    </div>
  );
}
