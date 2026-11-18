"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CheckoutResultDTO } from "@rozenblum/shared";
import type { Course } from "../../types";
import { ApiClientError, apiFetch, errorMessage } from "../../lib/api";
import { useModalA11y } from "../../lib/use-modal-a11y";
import { safeHttpUrl } from "../../lib/safe-url";
import {
  checkoutErrorMessage,
  checkoutPayload,
  createSingleFlight,
  normalizeCheckoutFields,
  validateCheckoutFields,
  type CheckoutField,
  type CheckoutFieldErrors,
  type CheckoutFields,
} from "./checkout-form";

type CheckoutModalProps = {
  course: Course;
  onClose: () => void;
};

type FieldConfig = {
  id: CheckoutField;
  label: string;
  type: "text" | "email";
  placeholder: string;
  autoComplete: string;
  inputMode: "text" | "email" | "numeric";
  maxLength: number;
  enterKeyHint: "next" | "go";
};

const FIELD_ORDER: CheckoutField[] = ["nombre", "email", "dni"];

const FIELDS: FieldConfig[] = [
  { id: "nombre", label: "Nombre y Apellido *", type: "text", placeholder: "Juan García", autoComplete: "name", inputMode: "text", maxLength: 120, enterKeyHint: "next" },
  { id: "email", label: "Correo Electrónico *", type: "email", placeholder: "juan@email.com", autoComplete: "email", inputMode: "email", maxLength: 254, enterKeyHint: "next" },
  { id: "dni", label: "DNI *", type: "text", placeholder: "Sin puntos, 7 u 8 dígitos", autoComplete: "off", inputMode: "numeric", maxLength: 8, enterKeyHint: "go" },
];

const CHECKOUT_TIMEOUT_MS = 30_000;
const PAYMENT_EMAIL_PREFIX = "rozenblum-payment-email:";

export default function CheckoutModal({ course, onClose }: CheckoutModalProps) {
  const titleId = useId();
  const guardRef = useRef(createSingleFlight());
  const mountedRef = useRef(true);
  const errorRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<CheckoutFields>({ nombre: "", email: "", dni: "" });
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [recovery, setRecovery] = useState<{ reference: string; email: string } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const requestClose = useCallback(() => {
    if (guardRef.current.active || loading) return;
    onClose();
  }, [loading, onClose]);

  const dialogRef = useModalA11y<HTMLDivElement>(requestClose);

  const updateField = (field: CheckoutField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    if (error) setError("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!guardRef.current.enter()) return;
    if (recovery) {
      guardRef.current.leave();
      return;
    }

    setError("");
    setUncertain(false);
    const errors = validateCheckoutFields(form);
    setFieldErrors(errors);
    const firstInvalid = FIELD_ORDER.find((field) => errors[field]);
    if (firstInvalid) {
      guardRef.current.leave();
      window.document.getElementById(firstInvalid)?.focus();
      return;
    }

    const values = normalizeCheckoutFields(form);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CHECKOUT_TIMEOUT_MS);
    setLoading(true);
    try {
      const result = await apiFetch<CheckoutResultDTO>("/api/checkout", {
        method: "POST",
        body: checkoutPayload(course.slug ?? String(course.id), values),
        signal: controller.signal,
      });
      if (!mountedRef.current) return;

      const paymentUrl = safeHttpUrl(result.payment?.url);
      const reference = result.order?.externalReference ?? result.order?.id;
      if (!paymentUrl) {
        // The order may already exist: never resubmit automatically. Offer a safe exit instead.
        if (reference) {
          setRecovery({ reference, email: values.email });
        } else {
          setUncertain(true);
          setError("La solicitud pudo haberse registrado, pero no recibimos un enlace de pago válido. Contactá al Estudio antes de intentarlo de nuevo.");
        }
        return;
      }

      if (reference) {
        try {
          sessionStorage.setItem(`${PAYMENT_EMAIL_PREFIX}${reference}`, values.email);
        } catch {
          // La redirección a Mercado Pago no depende del almacenamiento local.
        }
      }
      window.location.assign(paymentUrl);
    } catch (err) {
      if (!mountedRef.current) return;
      if (controller.signal.aborted) {
        setUncertain(true);
        setError("La solicitud tardó demasiado y no pudimos confirmar si la orden quedó registrada. Antes de reintentar, verificá tu correo o contactá al Estudio.");
      } else {
        const apiError = err instanceof ApiClientError ? err : null;
        // Network failures and 5xx responses can happen after the server persisted the order.
        setUncertain(!apiError || apiError.status === 0 || apiError.status >= 500);
        setError(checkoutErrorMessage(apiError?.code, errorMessage(err)));
      }
    } finally {
      window.clearTimeout(timeout);
      guardRef.current.leave();
      if (mountedRef.current) setLoading(false);
    }
  };

  const recoveryHref = recovery
    ? `/confirmacion?orden=${encodeURIComponent(recovery.reference)}&email=${encodeURIComponent(recovery.email)}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-6"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={loading}
        tabIndex={-1}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto outline-none sm:max-h-[90vh]"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 24px 80px rgba(0,0,0,0.25)" }}
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 pb-4 pt-5 sm:px-8 sm:pb-6 sm:pt-8" style={{ borderColor: "rgba(23,59,108,0.1)" }}>
          <h2 id={titleId} className="text-2xl font-light leading-tight sm:text-3xl" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>
            Inscripción al Curso
          </h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={loading}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center transition-opacity hover:opacity-50 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: "#173B6C" }}
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate aria-busy={loading} className="space-y-4 px-5 py-5 sm:space-y-5 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-2 rounded p-4 sm:flex-row sm:items-center sm:justify-between" style={{ backgroundColor: "#FAF8F5", border: "1px solid rgba(181,138,67,0.25)" }}>
            <div className="min-w-0">
              <p className="mb-0.5 text-xs font-medium uppercase tracking-widest" style={{ color: "#B58A43" }}>Inscribiéndote a</p>
              <p className="text-base font-medium leading-snug" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{course.title}</p>
            </div>
            <p className="whitespace-nowrap text-2xl font-light" style={{ color: "#B58A43", fontFamily: "'Cormorant Garamond', serif" }}>{course.price}</p>
          </div>

          {FIELDS.map(({ id, label, type, placeholder, autoComplete, inputMode, maxLength, enterKeyHint }) => {
            const fieldError = fieldErrors[id];
            return (
              <div key={id} className="flex flex-col gap-1.5">
                <label htmlFor={id} className="text-xs font-medium uppercase tracking-widest" style={{ color: "rgba(23,59,108,0.6)" }}>{label}</label>
                <input
                  id={id}
                  name={id}
                  type={type}
                  required
                  value={form[id]}
                  onChange={(event) => updateField(id, event.target.value)}
                  disabled={loading || Boolean(recovery)}
                  placeholder={placeholder}
                  autoComplete={autoComplete}
                  inputMode={inputMode}
                  enterKeyHint={enterKeyHint}
                  maxLength={maxLength}
                  minLength={id === "dni" ? 7 : id === "nombre" ? 3 : undefined}
                  pattern={id === "dni" ? "\\d{7,8}" : undefined}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? `${id}-error` : undefined}
                  className="min-h-12 w-full rounded px-3.5 py-3 text-base outline-none transition-all duration-200 disabled:bg-[#F4F1EC] disabled:opacity-70 sm:text-sm"
                  style={{ border: fieldError ? "1px solid #72132C" : "1px solid #E0E0E0", color: "#173B6C", fontFamily: "'Roboto', sans-serif" }}
                  onFocus={(event) => { event.currentTarget.style.border = fieldError ? "2px solid #72132C" : "2px solid #B58A43"; }}
                  onBlur={(event) => { event.currentTarget.style.border = fieldError ? "1px solid #72132C" : "1px solid #E0E0E0"; }}
                />
                {fieldError && <p id={`${id}-error`} role="alert" className="text-xs leading-relaxed" style={{ color: "#72132C" }}>{fieldError}</p>}
              </div>
            );
          })}

          <div className="rounded border-l-2 p-4" style={{ backgroundColor: "#FAF8F5", borderColor: "#B58A43" }}>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: "#173B6C" }}>Solicitud de inscripción</p>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(23,59,108,0.7)" }}>
              Usamos tu DNI para validar tu cuenta si ya existe, o como contraseña inicial si es tu primera compra. Si ya te inscribiste antes, usá el mismo correo y el mismo DNI. Al continuar, irás a Mercado Pago; la cuenta y el acceso se habilitan cuando se confirme el pago.
            </p>
          </div>

          {recovery && recoveryHref && (
            <div role="status" className="rounded border-l-2 p-4" style={{ backgroundColor: "#FFF8E8", borderColor: "#B58A43" }}>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: "#173B6C" }}>Solicitud registrada</p>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(23,59,108,0.75)" }}>
                Tu orden quedó creada, pero Mercado Pago no devolvió un enlace de pago utilizable. No vuelvas a enviar el formulario.
              </p>
              <p className="mt-2 text-xs" style={{ color: "rgba(23,59,108,0.75)" }}>
                Orden: <code className="break-all font-semibold" style={{ color: "#173B6C" }}>{recovery.reference}</code>
              </p>
              <a href={recoveryHref} className="mt-3 flex min-h-12 items-center justify-center rounded px-4 text-xs font-bold tracking-widest" style={{ backgroundColor: "#173B6C", color: "#FAF8F5" }}>
                CONSULTAR MI INSCRIPCIÓN
              </a>
            </div>
          )}

          {error && (
            <div ref={errorRef} id="checkout-error" tabIndex={-1} role="alert" className="rounded border-l-2 p-4 outline-none" style={{ backgroundColor: "#FFF1F3", borderColor: "#72132C" }}>
              <p className="text-xs leading-relaxed" style={{ color: "#72132C" }}>{error}</p>
            </div>
          )}

          {uncertain && (
            <div role="status" className="rounded border-l-2 p-4" style={{ backgroundColor: "#FFF8E8", borderColor: "#B58A43" }}>
              <p className="text-[11px] leading-relaxed" style={{ color: "#8A5A12" }}>
                La solicitud anterior pudo haberse registrado. Si volvés a enviar, se intentará reutilizar la orden existente cuando sea posible; no se crea una segunda orden automáticamente.
              </p>
            </div>
          )}

          {!recovery && (
            <button
              type="submit"
              disabled={loading}
              className="group flex min-h-14 w-full items-center justify-center gap-3 rounded-sm border px-4 py-3 text-xs font-bold tracking-widest transition-all duration-200 hover:brightness-125 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 sm:px-5 sm:py-4"
              style={{ backgroundColor: "#173B6C", borderColor: "#B58A43", color: "#FAF8F5", letterSpacing: "0.1em" }}
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                  PREPARANDO PAGO...
                </>
              ) : (
                <>
                  {uncertain ? "REINTENTAR SOLICITUD" : "CONTINUAR A MERCADO PAGO"}
                  <span aria-hidden="true" className="text-base transition-transform duration-200 group-hover:translate-x-1" style={{ color: "#D4A855" }}>→</span>
                </>
              )}
            </button>
          )}

          <p role="status" className="text-center text-[11px] leading-relaxed" style={{ color: "rgba(23,59,108,0.55)" }}>
            {loading ? "Estamos registrando tu solicitud y preparando el pago seguro en Mercado Pago." : "El acceso se habilita cuando se confirma el pago."}
          </p>

          <p className="text-center text-[11px] leading-relaxed" style={{ color: "rgba(23,59,108,0.55)" }}>
            Consultá los{" "}
            <a href="/terminos-y-condiciones" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: "#173B6C" }}>
              Términos y Condiciones
            </a>{" "}
            y la{" "}
            <a href="/politica-de-privacidad" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: "#173B6C" }}>
              Política de Privacidad
            </a>.
          </p>
        </form>
      </div>
    </div>
  );
}
