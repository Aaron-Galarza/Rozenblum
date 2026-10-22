"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderDTO } from "@rozenblum/shared";
import { apiFetch, errorMessage } from "../lib/api";
import { usePublicSettings } from "../lib/use-public-settings";

export default function ConfirmacionPage({
  reference,
  email,
}: {
  reference?: string;
  email?: string;
}) {
  const router = useRouter();
  const settings = usePublicSettings();
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!reference) return;
    const query = email ? `?email=${encodeURIComponent(email)}` : "";
    apiFetch<OrderDTO>(`/api/orders/${encodeURIComponent(reference)}${query}`)
      .then(setOrder)
      .catch((err) => setError(errorMessage(err)));
  }, [reference, email]);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 h-[68px]"
        style={{ backgroundColor: "#FAF8F5", borderBottom: "1px solid rgba(23,59,108,0.1)" }}
      >
        <button onClick={() => router.push("/")} className="flex items-center gap-3">
          {settings?.logoUrl && <img src={settings.logoUrl} alt={settings.companyName} className="h-10 w-auto object-contain" />}
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg text-center">
          {/* Gold checkmark circle */}
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8"
            style={{ backgroundColor: "#B58A43", boxShadow: "0 8px 32px rgba(181,138,67,0.35)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1
            className="text-5xl font-light mb-4"
            style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}
          >
            ¡Inscripción Registrada!
          </h1>

          <p className="text-base leading-relaxed mb-8" style={{ color: "rgba(23,59,108,0.65)" }}>
            Tu solicitud fue recibida correctamente.
          </p>

          {/* Status box */}
          <div
            className="p-6 rounded-lg mb-8 text-left"
            style={{ backgroundColor: "#FFFFFF", border: "2px solid #B58A43", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: "#f59e0b" }} />
              <div>
                <p className="text-sm font-bold mb-1" style={{ color: "#173B6C" }}>Acceso Pendiente de Aprobación</p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(23,59,108,0.75)" }}>
                  Tu solicitud quedó registrada con estado{" "}
                  <strong style={{ color: "#f59e0b" }}>Pendiente</strong>. Contactanos para coordinar el pago; un administrador confirmará el acceso al aula.
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

            <div className="h-px my-4" style={{ backgroundColor: "rgba(23,59,108,0.08)" }} />
            <div className="space-y-2">
              {[
                "Consultá por WhatsApp las instrucciones de pago",
                "Conservá el número de orden para identificar tu solicitud",
                "Iniciá sesión con la contraseña elegida cuando el pago esté confirmado",
              ].map((step, i) => (
                <div key={step} className="flex items-center gap-3 text-xs" style={{ color: "rgba(23,59,108,0.65)" }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: "rgba(181,138,67,0.15)", color: "#B58A43" }}>{i + 1}</div>
                  {step}
                </div>
              ))}
            </div>
          </div>

          {/* Next steps */}
          <p className="text-sm mb-6" style={{ color: "rgba(23,59,108,0.7)" }}>
            Escribinos por WhatsApp con tu número de orden para continuar con la inscripción.
          </p>

          {/* WhatsApp CTA */}
          <a
            href={settings?.contactWhatsapp ? `https://wa.me/${settings.contactWhatsapp}?text=${encodeURIComponent(`Hola, quiero consultar por mi inscripción${order ? ` ${order.externalReference ?? order.id}` : ""}.`)}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full py-4 text-sm font-bold tracking-widest rounded transition-all duration-200 hover:brightness-110 active:scale-95 mb-5"
            style={{ backgroundColor: "#25D366", color: "#FFFFFF", letterSpacing: "0.1em" }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            AVISAR POR WHATSAPP
          </a>

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
          © {new Date().getFullYear()} Estudio Jurídico Rozenblum · Términos de Servicio · Política de Privacidad
        </p>
      </footer>
    </div>
  );
}
