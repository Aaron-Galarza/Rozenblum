"use client";

import { useEffect, useId, useState } from "react";
import type { SiteSettingsDTO } from "@rozenblum/shared";
import { errorMessage } from "../../../lib/api";
import { useModalA11y } from "../../../lib/use-modal-a11y";
import Toast from "../../../components/ui/Toast";

type SettingsPayload = {
  companyName: string;
  supportEmail: string;
  logoUrl: string;
  privacyText: string;
};

type ConfigSectionProps = {
  settings: SiteSettingsDTO;
  onSave: (input: SettingsPayload) => Promise<void>;
};

export default function ConfigSection({ settings, onSave }: ConfigSectionProps) {
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [company, setCompany] = useState({
    companyName: settings.companyName,
    supportEmail: settings.supportEmail,
    logoUrl: settings.logoUrl,
  });
  const [privacyText, setPrivacyText] = useState(settings.privacyText);
  const [busy, setBusy] = useState(false);
  const previewTitleId = useId();
  const previewDialogRef = useModalA11y<HTMLDivElement>(() => setPreviewOpen(false), previewOpen);

  useEffect(() => {
    setCompany({
      companyName: settings.companyName,
      supportEmail: settings.supportEmail,
      logoUrl: settings.logoUrl,
    });
    setPrivacyText(settings.privacyText);
  }, [settings]);

  const showToast = (text: string, error = false) => { setToast({ text, error }); setTimeout(() => setToast(null), 2500); };

  const save = async (message: string) => {
    setBusy(true);
    try {
      await onSave({ ...company, privacyText });
      showToast(message);
    } catch (err) {
      showToast(errorMessage(err), true);
    } finally {
      setBusy(false);
    }
  };

  const fieldStyle: React.CSSProperties = { border: "1px solid rgba(23,59,108,0.2)", color: "#173B6C", backgroundColor: "#FAF8F5" };

  return (
    <>
      <h2 className="text-3xl font-light mb-8" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Configuración</h2>
      <div className="space-y-8 max-w-2xl">
        {/* Company data */}
        <div className="p-6 rounded-lg" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
          <h3 className="text-lg font-medium mb-5" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Datos de Empresa</h3>
          <div className="space-y-4">
            {([
              ["Nombre", "companyName", "text"],
              ["Logo URL", "logoUrl", "text"],
              ["Email de Soporte", "supportEmail", "email"],
            ] as const).map(([label, key, type]) => (
              <div key={key} className="flex flex-col gap-1.5">
                <label className="text-xs font-medium tracking-widest uppercase" style={{ color: "rgba(23,59,108,0.6)" }}>{label}</label>
                <input
                  type={type}
                  value={company[key]}
                  onChange={(e) => setCompany((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="px-4 py-3 text-sm outline-none transition-all"
                  style={fieldStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#B58A43")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(23,59,108,0.2)")}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-5">
            <button disabled={busy} onClick={() => void save("✓ Datos de Empresa guardados correctamente")} className="px-5 py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all disabled:opacity-50" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>GUARDAR</button>
          </div>
        </div>

        {/* Payment integration — read-only: secrets live only in the API environment */}
        <div className="p-6 rounded-lg" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
          <h3 className="text-lg font-medium mb-5" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Integración de Pagos</h3>
          <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid rgba(23,59,108,0.06)" }}>
            <span className="text-xs" style={{ color: "rgba(23,59,108,0.55)" }}>Proveedor</span>
            <span className="text-xs font-semibold" style={{ color: "#173B6C" }}>MercadoPago</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-xs" style={{ color: "rgba(23,59,108,0.55)" }}>Credenciales</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={settings.paymentsConfigured ? { backgroundColor: "#dcfce7", color: "#166534" } : { backgroundColor: "#fef3c7", color: "#92400e" }}>
              {settings.paymentsConfigured ? "Configuradas" : "Sin configurar"}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed mt-3" style={{ color: "rgba(23,59,108,0.5)" }}>
            Las credenciales de pago se administran únicamente en las variables de entorno del servidor y nunca se exponen al navegador.
          </p>
        </div>

        {/* Privacy policy */}
        <div className="p-6 rounded-lg" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
          <h3 className="text-lg font-medium mb-5" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Política de Privacidad y Términos</h3>
          <textarea
            rows={6}
            value={privacyText}
            onChange={(e) => setPrivacyText(e.target.value)}
            className="w-full px-4 py-3 text-sm outline-none resize-none transition-all"
            style={fieldStyle}
            onFocus={(e) => (e.target.style.borderColor = "#B58A43")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(23,59,108,0.2)")}
          />
          <div className="flex gap-3 mt-4">
            <button disabled={busy} onClick={() => void save("✓ Política guardada correctamente")} className="px-5 py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all disabled:opacity-50" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>GUARDAR</button>
            <button onClick={() => setPreviewOpen(true)} className="px-5 py-2.5 text-xs font-medium border hover:opacity-70 transition-opacity" style={{ color: "#173B6C", borderColor: "#173B6C" }}>PREVIEW</button>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: "rgba(23,59,108,0.5)", backdropFilter: "blur(3px)" }} onClick={(e) => e.target === e.currentTarget && setPreviewOpen(false)}>
          <div
            ref={previewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={previewTitleId}
            tabIndex={-1}
            className="w-full max-w-xl mx-4 p-6 rounded-lg outline-none"
            style={{ backgroundColor: "#FAF8F5", border: "1px solid rgba(181,138,67,0.3)", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id={previewTitleId} style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", fontWeight: 500 }}>Vista Previa — Política de Privacidad</h3>
              <button onClick={() => setPreviewOpen(false)} aria-label="Cerrar" className="hover:opacity-50 transition-opacity" style={{ color: "#173B6C" }}>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="p-4 rounded text-sm leading-relaxed" style={{ backgroundColor: "#FFFFFF", color: "#173B6C", border: "1px solid rgba(23,59,108,0.08)", maxHeight: 300, overflowY: "auto" }}>
              {privacyText}
            </div>
            <button onClick={() => setPreviewOpen(false)} className="mt-4 w-full py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>CERRAR</button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.text} error={toast.error} />}
    </>
  );
}
