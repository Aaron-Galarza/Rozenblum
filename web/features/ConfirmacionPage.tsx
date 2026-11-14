"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderDTO } from "@rozenblum/shared";
import { ApiClientError, apiFetch, errorMessage } from "../lib/api";
import BrandLogo from "../components/ui/BrandLogo";
import { IconInstagram, IconWhatsApp } from "../components/icons";
import { INSTITUTIONAL } from "../lib/institutional";
import { safeHttpUrl } from "../lib/safe-url";
import { confirmationView, isRegistrationClosed, isTerminalOrder } from "./confirmacion-status";

const STORAGE_PREFIX = "rozenblum-payment-email:";
const POLL_FAST_MS = 5_000;
const POLL_SLOW_MS = 30_000;
const RECONCILE_EVERY_MS = 15_000;
const POLL_MAX_MS = 15 * 60_000;
const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_BACKOFF_MS = 60_000;

export default function ConfirmacionPage({
  reference,
  email,
  paymentId,
}: {
  reference?: string;
  email?: string;
  paymentId?: string;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [credentials, setCredentials] = useState<{ email: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [pollingStopped, setPollingStopped] = useState(false);
  const [generation, setGeneration] = useState(0);
  const orderRef = useRef<OrderDTO | null>(null);
  const referenceRef = useRef(reference);
  const terminalRef = useRef(false);
  const mountedRef = useRef(true);

  const receiptEmail = credentials?.email ?? null;
  const hasLookup = Boolean(reference && (receiptEmail || paymentId));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    referenceRef.current = reference;
    orderRef.current = null;
    terminalRef.current = false;
    setOrder(null);
    setError("");
    setPollingStopped(false);
  }, [reference]);

  useEffect(() => {
    setCredentials(null);
    if (!reference) return;
    if (email) {
      setCredentials({ email });
      return;
    }
    let stored: string | null;
    try {
      stored = sessionStorage.getItem(`${STORAGE_PREFIX}${reference}`);
    } catch {
      stored = null;
    }
    setCredentials({ email: stored?.trim() ? stored : null });
  }, [reference, email]);

  useEffect(() => {
    if (!reference) {
      setError("Falta la referencia de la orden para consultar su estado.");
      return;
    }
    if (credentials && !credentials.email && !paymentId) {
      setError("Faltan los datos del pago para consultar esta orden. Abrí el enlace de confirmación completo o contactá al Estudio.");
    }
  }, [reference, credentials, paymentId]);

  const commit = useCallback((data: OrderDTO) => {
    if (!mountedRef.current) return;
    const current = orderRef.current;
    const next = current?.estado === "Pagado" &&
      (data.estado === "Pendiente" || data.estado === "Rechazado" || data.estado === "Vencido") ? current : data;
    orderRef.current = next;
    setOrder(next);
    setError("");
    if (isTerminalOrder(next)) {
      terminalRef.current = true;
      setPollingStopped(true);
    }
  }, []);

  const performCheck = useCallback(async ({ reconcile, manual = false }: { reconcile: boolean; manual?: boolean }) => {
    if (!reference || (!receiptEmail && !paymentId)) return false;
    const requestReference = reference;
    if (manual && mountedRef.current) setChecking(true);
    try {
      let data: OrderDTO;
      if (reconcile) {
        data = await apiFetch<OrderDTO>(`/api/orders/${encodeURIComponent(reference)}/reconcile`, {
          method: "POST",
          body: {
            ...(receiptEmail ? { email: receiptEmail } : {}),
            ...(paymentId ? { paymentId } : {}),
          },
        });
      } else {
        data = await apiFetch<OrderDTO>(`/api/orders/${encodeURIComponent(reference)}?email=${encodeURIComponent(receiptEmail!)}`);
      }
      if (referenceRef.current !== requestReference) return false;
      commit(data);
      return true;
    } catch (err) {
      if (referenceRef.current !== requestReference) return false;
      const conflict = err instanceof ApiClientError && err.status === 409;
      if (reconcile && receiptEmail && !conflict) {
        try {
          const data = await apiFetch<OrderDTO>(`/api/orders/${encodeURIComponent(reference)}?email=${encodeURIComponent(receiptEmail)}`);
          if (referenceRef.current !== requestReference) return false;
          commit(data);
          return true;
        } catch {
          // Keep the original error; the receipt lookup did not provide a newer state.
        }
      }
      if (mountedRef.current) setError(errorMessage(err));
      return false;
    } finally {
      if (manual && mountedRef.current) setChecking(false);
    }
  }, [commit, paymentId, receiptEmail, reference]);

  useEffect(() => {
    if (!credentials || !hasLookup || terminalRef.current) return;
    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;
    let lastReconcile = 0;
    const startedAt = Date.now();

    const schedule = (delay: number) => {
      if (cancelled || terminalRef.current) return;
      timer = window.setTimeout(() => { void tick(); }, delay);
    };

    const tick = async () => {
      if (cancelled || terminalRef.current) return;
      if (document.visibilityState === "hidden") {
        schedule(15_000);
        return;
      }
      const shouldReconcile = !receiptEmail || Date.now() - lastReconcile >= RECONCILE_EVERY_MS;
      if (shouldReconcile) lastReconcile = Date.now();
      const ok = await performCheck({ reconcile: shouldReconcile });
      if (cancelled || terminalRef.current) return;
      if (!ok) {
        failures += 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES || Date.now() - startedAt >= POLL_MAX_MS) {
          setPollingStopped(true);
          return;
        }
        schedule(Math.min(MAX_BACKOFF_MS, POLL_FAST_MS * 2 ** (failures - 1)));
        return;
      }
      failures = 0;
      if (Date.now() - startedAt >= POLL_MAX_MS) {
        setPollingStopped(true);
        return;
      }
      schedule(!receiptEmail ? RECONCILE_EVERY_MS : orderRef.current?.estado === "Pagado" ? POLL_SLOW_MS : POLL_FAST_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || cancelled || terminalRef.current) return;
      if (timer) window.clearTimeout(timer);
      schedule(0);
    };

    setPollingStopped(false);
    schedule(0);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [credentials, generation, hasLookup, performCheck, receiptEmail]);

  const refreshNow = async () => {
    const ok = await performCheck({ reconcile: true, manual: true });
    if (!ok || terminalRef.current) return;
    setPollingStopped(false);
    setGeneration((value) => value + 1);
  };

  useEffect(() => {
    if (!order?.paymentExpiresAt) return;
    const expiresAt = Date.parse(order.paymentExpiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { setNow(Date.now()); return; }
    const timer = window.setTimeout(() => setNow(Date.now()), remaining + 20);
    return () => window.clearTimeout(timer);
  }, [order?.paymentExpiresAt, now]);

  const view = useMemo(() => confirmationView(order, { error: order ? undefined : error, now }), [order, error, now]);
  const registrationClosed = isRegistrationClosed(order, now);
  const courseClosed = order?.fulfillmentIssue === "course_closed";
  const latePayment = order?.fulfillmentIssue === "payment_expired";
  const isMercadoPago = order?.paymentProvider === "mercadopago";
  const paymentUrl = safeHttpUrl(order?.paymentUrl);
  const needsContact = (registrationClosed && order?.estado !== "Pagado") || courseClosed || latePayment ||
    order?.estado === "En disputa" || order?.estado === "Rechazado" || Boolean(error);
  const canResumePayment = Boolean(
    paymentUrl && isMercadoPago && !courseClosed && !registrationClosed &&
    (order?.estado === "Pendiente" || order?.estado === "Rechazado"),
  );
  const missingPaymentLink = Boolean(
    order && isMercadoPago && !courseClosed && !registrationClosed &&
    (order.estado === "Pendiente" || order.estado === "Rechazado") && !paymentUrl,
  );
  const terminal = isTerminalOrder(order);
  const toneColor = view.tone === "approved" ? "#27704A"
    : view.tone === "rejected" || view.tone === "refunded" ? "#72132C" : "#B58A43";
  const whatsappHref = useMemo(() => {
    const text = order
      ? `Hola, necesito ayuda con mi inscripción. Orden: ${order.externalReference ?? order.id}. Curso: ${order.curso}.`
      : `Hola, necesito ayuda con mi inscripción. Orden: ${reference ?? "sin referencia"}.`;
    return `${INSTITUTIONAL.whatsappHref}?text=${encodeURIComponent(text)}`;
  }, [order, reference]);

  const infoRow = (label: string, value: string, breakAll = false) => (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0">{label}</dt>
      <dd className={`min-w-0 text-right font-semibold ${breakAll ? "break-all" : "break-words"}`} style={{ color: "#173B6C" }}>{value}</dd>
    </div>
  );

  const icon = view.approved
    ? <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 sm:h-12 sm:w-12" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
    : view.tone === "rejected" || view.tone === "refunded"
      ? <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 sm:h-12 sm:w-12" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      : view.tone === "review"
        ? <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 sm:h-12 sm:w-12" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 sm:h-12 sm:w-12" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
      <header className="flex h-[68px] items-center justify-between px-4 sm:px-6" style={{ backgroundColor: "#FAF8F5", borderBottom: "1px solid rgba(23,59,108,0.1)" }}>
        <button type="button" onClick={() => router.push("/")} className="flex min-h-11 items-center gap-3" aria-label="Ir al inicio">
          <BrandLogo className="h-9 w-auto object-contain sm:h-10" />
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
        <div className="w-full max-w-lg text-center">
          <div
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full sm:mb-8 sm:h-24 sm:w-24"
            style={{ backgroundColor: toneColor, boxShadow: "0 8px 32px rgba(181,138,67,0.25)" }}
          >
            {icon}
          </div>

          <h1 className="mb-3 text-3xl font-light leading-tight sm:mb-4 sm:text-4xl lg:text-5xl" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>
            {view.title}
          </h1>

          <p className="mb-6 text-sm leading-relaxed sm:mb-8 sm:text-base" style={{ color: "rgba(23,59,108,0.65)" }}>
            {view.summary}
          </p>

          <div className="mb-6 rounded-lg p-4 text-left sm:mb-8 sm:p-6" style={{ backgroundColor: "#FFFFFF", border: "2px solid #B58A43", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }} aria-live="polite">
            <div className="mb-4 flex items-start gap-3">
              <div className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: toneColor }} />
              <div className="min-w-0">
                <p className="mb-1 text-sm font-bold" style={{ color: "#173B6C" }}>{view.badge}</p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(23,59,108,0.75)" }}>
                  {order ? (
                    <>Tu orden está <strong>{order.estado}</strong>. {view.detail}</>
                  ) : view.detail}
                </p>
                {order && (
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "rgba(23,59,108,0.6)" }}>
                    {isMercadoPago
                      ? pollingStopped
                        ? "La actualización automática está pausada; usá “Actualizar estado” para consultar novedades."
                        : "Mercado Pago informa el resultado automáticamente; esta página se actualiza sola."
                      : "Esta orden requiere atención del Estudio."}
                  </p>
                )}
              </div>
            </div>

            {(order || error) && (
              <>
                <div className="my-4 h-px" style={{ backgroundColor: "rgba(23,59,108,0.08)" }} />
                {order ? (
                  <dl className="space-y-2 text-xs" style={{ color: "rgba(23,59,108,0.7)" }}>
                    {infoRow("Orden", order.externalReference ?? order.id, true)}
                    {infoRow("Curso", order.curso)}
                    {infoRow("Importe", order.monto)}
                    {order.alumno ? infoRow("Alumno", order.alumno) : null}
                    {order.fecha ? infoRow("Fecha", order.fecha) : null}
                    {order.metodo ? infoRow("Método", order.metodo) : null}
                  </dl>
                ) : (
                  <p className="text-xs" style={{ color: "#72132C" }}>{error}</p>
                )}
              </>
            )}
            {order && error && (
              <p role="alert" className="mt-3 text-xs leading-relaxed" style={{ color: "#72132C" }}>
                No se pudo actualizar el estado: {error}. Seguimos mostrando el último estado confirmado.
              </p>
            )}

            {(view.tone === "pending" || view.tone === "rejected") && !courseClosed && !registrationClosed && (
              <>
                <div className="my-4 h-px" style={{ backgroundColor: "rgba(23,59,108,0.08)" }} />
                <div className="space-y-2">
                  {[
                    "Conservá el número de orden para identificar tu solicitud",
                    "Ingresá al aula con tu cuenta cuando el pago esté confirmado",
                  ].map((step, index) => (
                    <div key={step} className="flex items-center gap-3 text-xs" style={{ color: "rgba(23,59,108,0.65)" }}>
                      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ backgroundColor: "rgba(181,138,67,0.15)", color: "#B58A43" }}>{index + 1}</div>
                      {step}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {canResumePayment && paymentUrl && (
            <a href={paymentUrl} className="mb-3 flex min-h-12 w-full items-center justify-center rounded px-4 py-3 text-center text-sm font-bold tracking-widest" style={{ backgroundColor: "#009EE3", color: "#FFFFFF" }}>
              CONTINUAR PAGO EN MERCADO PAGO
            </a>
          )}
          {missingPaymentLink && (
            <p role="alert" className="mb-3 text-sm leading-relaxed" style={{ color: "#72132C" }}>
              No pudimos recuperar el enlace de pago. Consultá tu número de orden con el Estudio.
            </p>
          )}
          {pollingStopped && hasLookup && !terminal && (
            <p role="status" className="mb-3 text-xs leading-relaxed" style={{ color: "rgba(23,59,108,0.65)" }}>
              La actualización automática se pausó. Usá “Actualizar estado” para volver a consultar.
            </p>
          )}

          {needsContact && (
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer"
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded border px-4 py-2 text-sm font-semibold"
                style={{ borderColor: "#173B6C", color: "#173B6C" }}>
                <IconWhatsApp className="h-5 w-5" /> WhatsApp
              </a>
              <a href={INSTITUTIONAL.instagramHref} target="_blank" rel="noopener noreferrer"
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded border px-4 py-2 text-sm font-semibold"
                style={{ borderColor: "#173B6C", color: "#173B6C" }}>
                <IconInstagram className="h-5 w-5" /> Instagram
              </a>
            </div>
          )}

          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {hasLookup && (
              <button
                type="button"
                onClick={() => void refreshNow()}
                disabled={checking}
                className="inline-flex min-h-11 w-full items-center justify-center rounded border px-4 text-xs font-semibold transition-opacity hover:opacity-70 disabled:cursor-wait disabled:opacity-50 sm:w-auto"
                style={{ color: "#173B6C", borderColor: "rgba(23,59,108,0.3)" }}
              >
                {checking ? "Consultando…" : "Actualizar estado"}
              </button>
            )}
            {!needsContact && <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded border px-4 text-xs font-semibold transition-opacity hover:opacity-70 sm:w-auto"
              style={{ color: "#173B6C", borderColor: "rgba(23,59,108,0.3)" }}
            >
              <IconWhatsApp className="h-4 w-4" />
              Consultar por WhatsApp
            </a>}
          </div>

          <button type="button" onClick={() => router.push("/")} className="min-h-11 px-3 text-sm underline underline-offset-2 transition-opacity hover:opacity-60" style={{ color: "#173B6C" }}>
            Ir al inicio
          </button>
        </div>
      </main>

      <footer className="px-4 py-5 text-center sm:px-6" style={{ backgroundColor: "#173B6C" }}>
        <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>
          © {new Date().getFullYear()} Estudio Jurídico Rozenblum
        </p>
      </footer>
    </div>
  );
}
