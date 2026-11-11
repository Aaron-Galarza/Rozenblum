"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderDTO } from "@rozenblum/shared";
import { apiFetch, errorMessage } from "../lib/api";
import BrandLogo from "../components/ui/BrandLogo";
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

  useEffect(() => {
    if (!reference) { setError("Falta la referencia de la orden para consultar su estado."); return; }
    const receiptEmail = email ?? sessionStorage.getItem(`rozenblum-payment-email:${reference}`);
    if (!receiptEmail) { setError("Falta el correo de la inscripción para consultar la orden."); return; }
    const query = `?email=${encodeURIComponent(receiptEmail)}`;
    const refresh = () => apiFetch<OrderDTO>(`/api/orders/${encodeURIComponent(reference)}${query}`)
      .then((data) => { setOrder(data); setError(""); }).catch((err) => setError(errorMessage(err)));
    let settled = false;
    let reconciling = false;
    const reconcile = async () => {
      if (settled || reconciling || document.visibilityState === "hidden") return;
      reconciling = true;
      try {
        const data = await apiFetch<OrderDTO>(`/api/orders/${encodeURIComponent(reference)}/reconcile`, {
          method: "POST", body: { email: receiptEmail, ...(paymentId ? { paymentId } : {}) },
        });
        setOrder(data);
        setError("");
        settled = data.estado === "Pagado" || data.estado === "Reembolsado";
      } catch (err) {
        setError(errorMessage(err));
        void refresh();
      } finally {
        reconciling = false;
      }
    };
    void reconcile();
    const timer = window.setInterval(() => { void refresh(); }, 5_000);
    const reconciliationTimer = window.setInterval(() => { void reconcile(); }, 15_000);
    return () => { window.clearInterval(timer); window.clearInterval(reconciliationTimer); };
  }, [reference, email, paymentId]);

  const isMercadoPago = order?.paymentProvider === "mercadopago";
  const isPaid = order?.estado === "Pagado";
  const paymentUrl = safeHttpUrl(order?.paymentUrl);

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
            {isPaid ? "¡Pago confirmado!" : order?.estado === "Rechazado" ? "Pago rechazado" : order ? "Pago en verificación" : "Estado de la inscripción"}
          </h1>

          <p className="text-base leading-relaxed mb-8" style={{ color: "rgba(23,59,108,0.65)" }}>
            {isPaid ? "Tu acceso al aula ya está habilitado." : order ? "Tu solicitud fue recibida correctamente." : error ? "No pudimos verificar el estado de tu orden." : "Estamos consultando tu orden."}
          </p>

          {/* Status box */}
          <div
            className="p-6 rounded-lg mb-8 text-left"
            style={{ backgroundColor: "#FFFFFF", border: "2px solid #B58A43", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: "#f59e0b" }} />
              <div>
                <p className="text-sm font-bold mb-1" style={{ color: "#173B6C" }}>{isPaid ? "Acceso habilitado" : "Estado de la inscripción"}</p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(23,59,108,0.75)" }}>
                  {order ? <>Tu orden está <strong>{order.estado}</strong>. {isMercadoPago ? "Mercado Pago informa el resultado automáticamente; esta página se actualiza sola." : "Esta orden antigua requiere atención del Estudio."}</> : error ? "No se pudo consultar la orden." : "Estamos consultando el estado de tu orden."}
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
            <div className="space-y-2">
              {[
                "Conservá el número de orden para identificar tu solicitud",
                "Ingresá con tu correo y DNI cuando el pago esté confirmado",
              ].map((step, i) => (
                <div key={step} className="flex items-center gap-3 text-xs" style={{ color: "rgba(23,59,108,0.65)" }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: "rgba(181,138,67,0.15)", color: "#B58A43" }}>{i + 1}</div>
                  {step}
                </div>
              ))}
            </div>
          </div>

          {/* Next steps */}
          {isMercadoPago && !isPaid && paymentUrl && (
            <a href={paymentUrl} className="block w-full py-4 mb-5 rounded text-sm font-bold tracking-widest" style={{ backgroundColor: "#009EE3", color: "#FFFFFF" }}>
              CONTINUAR PAGO EN MERCADO PAGO
            </a>
          )}
          {isMercadoPago && !isPaid && order && !paymentUrl && (
            <p role="alert" className="mb-5 text-sm" style={{ color: "#72132C" }}>No pudimos recuperar el enlace de pago. Consultá tu número de orden con el Estudio.</p>
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
