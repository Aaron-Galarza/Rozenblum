"use client";

import Link from "next/link";

export default function SimpleFooter() {
  return (
    <div className="flex-shrink-0 py-3 text-center" style={{ backgroundColor: "#173B6C" }}>
      <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>
        © {new Date().getFullYear()} Estudio Jurídico Rozenblum ·{" "}
        <Link href="/terminos-y-condiciones" className="hover:underline">Términos de Servicio</Link> ·{" "}
        <Link href="/politica-de-privacidad" className="hover:underline">Política de Privacidad</Link>
      </p>
    </div>
  );
}
