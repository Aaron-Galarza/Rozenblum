"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderDTO } from "@rozenblum/shared";
import { apiFetch, errorMessage } from "../lib/api";
import BrandLogo from "../components/ui/BrandLogo";
import { IconInstagram, IconWhatsApp } from "../components/icons";
import { INSTITUTIONAL } from "../lib/institutional";
import { safeHttpUrl } from "../lib/safe-url";

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

  useEffect(() => {
    if (!reference) { setError("Falta la referencia de la orden para consultar su estado."); return; }
    const receiptEmail = email ?? sessionStorage.getItem(`rozenblum-payment-email:${reference}`);
    if (!receiptEmail && !paymentId) { setError("Faltan los datos del pago para consultar la orden."); return; }
    let settled = false;
    const acceptOrder = (data: OrderDTO) => {
      setOrder((current) => current?.estado === "Pagado" &&
        ["Pendiente", "Rechazado", "Vencido"].includes(data.estado) ? current : data);
      setError("");
      settled ||= ["Pagado", "Reembolsado", "Vencido"].includes(data.estado);
    };
    const refresh = () => (receiptEmail
      ? apiFetch<OrderDTO>(`/api/orders/${encodeURIComponent(reference)}?email=${encodeURIComponent(receiptEmail)}`)
      : apiFetch<OrderDTO>(`/api/orders/${encodeURIComponent(reference)}/reconcile`, {
        method: "POST", body: { paymentId },
      }))
      .then(acceptOrder).catch((err) => setError(errorMessage(err)));
    let reconciling = false;
    const reconcile = async () => {
      if (settled || reconciling || document.visibilityState === "hidden") return;
      reconciling = true;
      try {
        const data = await apiFetch<OrderDTO>(`/api/orders/${encodeURIComponent(reference)}/reconcile`, {
          method: "POST", body: { ...(receiptEmail ? { email: receiptEmail } : {}),
            ...(paymentId ? { paymentId } : {}) },
        });
        acceptOrder(data);
      } catch (err) {
        setError(errorMessage(err));
        void refresh();
      } finally {
        reconciling = false;
      }
    };
    void reconcile();
    const reconciliationTimer = window.setInterval(() => { void reconcile(); }, 15_000);
    return () => window.clearInterval(reconciliationTimer);
  }, [reference, email, paymentId]);

  useEffect(() => {
    if (!order?.paymentExpiresAt) return;
    const remaining = Date.parse(order.paymentExpiresAt) - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(remaining + 20, 300_000));
    return () => window.clearTimeout(timer);
  }, [order?.paymentExpiresAt, now]);

  const isMercadoPago = order?.paymentProvider === "mercadopago";
  const courseClosed = order?.fulfillmentIssue === "course_closed";
  const latePayment = order?.fulfillmentIssue === "payment_expired";
  const needsReview = order?.estado === "Pagado" && (courseClosed || latePayment);
  const refunded = order?.estado === "Reembolsado";
  const closedWithoutPayment = courseClosed && !needsReview && !refunded;
  const paymentExpired = order?.estado === "Vencido" || Boolean(order &&
    (order.estado === "Pendiente" || order.estado === "Rechazado") &&
    order.paymentExpiresAt && Date.parse(order.paymentExpiresAt) <= now);
  const disputed = order?.estado === "En disputa";
  const isPaid = order?.estado === "Pagado" && !needsReview;
  const paymentUrl = paymentExpired ? null : safeHttpUrl(order?.paymentUrl);
  const needsContact = paymentExpired || needsReview || disputed ||
    order?.estado === "Rechazado" || Boolean(error);
  const whatsappHref = `${INSTITUTIONAL.whatsappHref}?text=${encodeURIComponent(
    `Hola, necesito ayuda con mi inscripción. Orden: ${order?.externalReference ?? reference ?? "sin referencia"}.`,
  )}`;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 h-[68px]"
        style={{ backgroundColor: "#FAF8F5", borderBottom: "1px solid rgba(23,59,108,0.1)" }}
      >
        <button onClick={() => router.push("/")} className="flex items-center gap-3">
          <BrandLogo className="h-10 w-auto object-contain" />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg text-center">
          {/* Estado visible mientras el proveedor confirma el pago. */}
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8"
            style={{ backgroundColor: isPaid ? "#27704A" : "#B58A43", boxShadow: "0 8px 32px rgba(181,138,67,0.25)" }}
          >
            {isPaid ? <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12"><polyline points="20 6 9 17 4 12" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" className="w-12 h-12"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>}
          </div>

          <h1
            className="text-5xl font-light mb-4"
            style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}
          >
            {needsReview ? "Pago recibido fuera de plazo" : refunded ? "Pago devuelto" : closedWithoutPayment ? "Curso finalizado" : paymentExpired ? "Orden vencida" : isPaid ? "¡Pago confirmado!" : disputed ? "Pago en revisión" : order?.estado === "Rechazado" ? "Pago rechazado" : order ? "Pago en verificación" : "Estado de la inscripción"}
          </h1>

          <p className="text-base leading-relaxed mb-8" style={{ color: "rgba(23,59,108,0.65)" }}>
            {needsReview ? "Mercado Pago registró un cobro fuera de plazo. No habilitamos el aula; contactá al Estudio con tu número de orden para resolverlo." : refunded ? "Mercado Pago registró la devolución. El acceso al aula no está habilitado." : closedWithoutPayment ? "El curso finalizó y este enlace de pago ya no está disponible." : paymentExpired ? "Pasaron cinco minutos sin confirmación. La orden y su enlace de pago vencieron. Si realizaste un pago, contactanos con el número de orden." : isPaid ? "Tu acceso al aula ya está habilitado." : disputed ? "Mercado Pago está revisando el cobro. El acceso al aula está suspendido mientras se resuelve." : order?.estado === "Rechazado" ? "Mercado Pago rechazó el pago. Podés volver a intentarlo mientras el enlace siga vigente." : order ? "Tu solicitud fue recibida. Estamos verificando el pago con Mercado Pago." : error ? "No pudimos verificar el estado de tu orden." : "Estamos consultando tu orden."}
          </p>

          {/* Status box */}
          <div
            className="p-6 rounded-lg mb-8 text-left"
            style={{ backgroundColor: "#FFFFFF", border: "2px solid #B58A43", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: "#f59e0b" }} />
              <div>
                <p className="text-sm font-bold mb-1" style={{ color: "#173B6C" }}>{needsReview ? "Cobro para revisar" : refunded ? "Devolución registrada" : closedWithoutPayment || paymentExpired ? "Inscripción cerrada" : isPaid ? "Acceso habilitado" : disputed ? "Pago en revisión" : "Estado de la inscripción"}</p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(23,59,108,0.75)" }}>
                  {order ? <>Tu orden está <strong>{paymentExpired ? "Vencido" : order.estado}</strong>. {needsReview ? "El cobro necesita revisión y el acceso no fue activado." : refunded ? "La devolución quedó registrada." : closedWithoutPayment ? "No se confirmó un pago antes de finalizar el curso." : paymentExpired ? "El enlace de pago ya no está disponible." : disputed ? "El acceso está suspendido hasta que Mercado Pago resuelva la disputa." : isMercadoPago ? "Mercado Pago informa el resultado automáticamente mientras esta página verifica la orden." : "Esta orden antigua requiere atención del Estudio."}</> : error ? "No se pudo consultar la orden." : "Estamos consultando el estado de tu orden."}
                </p>
              </div>
            </div>

            {(order || error) && (
              <>
                <div className="h-px my-4" style={{ backgroundColor: "rgba(23,59,108,0.08)" }} />
                {order ? (
                  <div className="space-y-2 text-xs" style={{ color: "rgba(23,59,108,0.7)" }}>
                    <div className="flex justify-between gap-4">
                      <span>Orden</span>
                      <span className="font-semibold" style={{ color: "#173B6C" }}>{order.externalReference ?? order.id}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Curso</span>
                      <span className="font-semibold text-right" style={{ color: "#173B6C" }}>{order.curso}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Importe</span>
                      <span className="font-semibold" style={{ color: "#173B6C" }}>{order.monto}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: "#72132C" }}>{error}</p>
                )}
              </>
            )}
            {order && error && <p role="alert" className="text-xs mt-3" style={{ color: "#72132C" }}>No se pudo actualizar el estado: {error}</p>}

            <div className="h-px my-4" style={{ backgroundColor: "rgba(23,59,108,0.08)" }} />
            {!courseClosed && !paymentExpired && !refunded && <div className="space-y-2">
              {[
                "Conservá el número de orden para identificar tu solicitud",
                "Ingresá con tu correo y DNI cuando el pago esté confirmado",
              ].map((step, i) => (
                <div key={step} className="flex items-center gap-3 text-xs" style={{ color: "rgba(23,59,108,0.65)" }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: "rgba(181,138,67,0.15)", color: "#B58A43" }}>{i + 1}</div>
                  {step}
                </div>
              ))}
            </div>}
          </div>

          {/* Next steps */}
          {isMercadoPago && !isPaid && paymentUrl && (
            <a href={paymentUrl} className="block w-full py-4 mb-5 rounded text-sm font-bold tracking-widest" style={{ backgroundColor: "#009EE3", color: "#FFFFFF" }}>
              CONTINUAR PAGO EN MERCADO PAGO
            </a>
          )}
          {isMercadoPago && !courseClosed && !paymentExpired && order &&
            (order.estado === "Pendiente" || order.estado === "Rechazado") && !paymentUrl && (
            <p role="alert" className="mb-5 text-sm" style={{ color: "#72132C" }}>No pudimos recuperar el enlace de pago. Consultá tu número de orden con el Estudio.</p>
          )}
          {needsContact && (
            <div className="mb-6 flex flex-col gap-3 sm:flex-row">
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

          <button
            onClick={() => router.push("/")}
            className="text-sm underline underline-offset-2 hover:opacity-60 transition-opacity"
            style={{ color: "#173B6C" }}
          >
            Ir al inicio
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-5 px-6 text-center" style={{ backgroundColor: "#173B6C" }}>
        <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>
          © {new Date().getFullYear()} Estudio Jurídico Rozenblum
        </p>
      </footer>
    </div>
  );
}
