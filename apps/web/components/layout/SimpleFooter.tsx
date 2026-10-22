"use client";

import { usePublicSettings } from "../../lib/use-public-settings";

export default function SimpleFooter() {
  const settings = usePublicSettings();
  return (
    <div className="flex-shrink-0 py-3 text-center" style={{ backgroundColor: "#173B6C" }}>
      <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>
        Términos de Servicio · Política de Privacidad {settings && <>· Soporte: {settings.supportEmail}</>}
      </p>
    </div>
  );
}
