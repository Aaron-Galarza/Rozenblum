"use client";

import { usePublicSettings } from "../../lib/use-public-settings";
import { INSTITUTIONAL } from "../../lib/institutional";
import Link from "next/link";

const NAV_LINKS = ["Inicio", "Áreas", "Nosotros", "Equipo", "Cursos", "Contacto"];

type LandingFooterProps = {
  scrollTo: (id: string) => void;
  goToAula: () => void;
  tagline?: string;
};

export default function LandingFooter({ scrollTo, goToAula, tagline }: LandingFooterProps) {
  const settings = usePublicSettings();
  return (
    <div style={{ borderTop: "1px solid rgba(181,138,67,0.18)" }}>
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:grid-cols-3 sm:gap-12 sm:py-16">
        <div className="flex flex-col gap-4">
          {settings?.logoUrl && <img src={settings.logoUrl} alt={settings.companyName} className="h-10 w-auto object-contain" style={{ filter: "brightness(0) invert(1)", opacity: 0.75 }} />}
          <p className="max-w-xs text-sm leading-relaxed" style={{ color: "rgba(250,248,245,0.72)" }}>{tagline}</p>
        </div>
        <div>
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "#D4A855" }}>Navegación</p>
          <ul className="space-y-1">
            {NAV_LINKS.map((link) => (
              <li key={link}>
                <button onClick={() => { if (link === "Cursos") { goToAula(); return; } scrollTo(link.toLowerCase().replace("á","a").replace("é","e").replace("ó","o").replace("ú","u").replace("í","i")); }} className="min-h-10 py-2 text-left text-sm tracking-wide transition-colors duration-200 hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}>{link}</button>
              </li>
            ))}
          </ul>
          <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "#D4A855" }}>Información legal</p>
          <ul className="space-y-1">
            <li><Link href="/politica-de-privacidad" className="inline-flex min-h-10 items-center py-2 text-sm tracking-wide transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}>Política de Privacidad</Link></li>
            <li><Link href="/terminos-y-condiciones" className="inline-flex min-h-10 items-center py-2 text-sm tracking-wide transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}>Términos y Condiciones</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "#D4A855" }}>Contacto Rápido</p>
          <div className="space-y-3">
            <a href={INSTITUTIONAL.mapsHref} target="_blank" rel="noopener noreferrer" className="block text-sm leading-relaxed transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}>{INSTITUTIONAL.address}</a>
            <a href={INSTITUTIONAL.phoneHref} className="block text-sm leading-relaxed transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}>{INSTITUTIONAL.phone}</a>
            <a href={INSTITUTIONAL.whatsappHref} target="_blank" rel="noopener noreferrer" className="block text-sm leading-relaxed transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}>WhatsApp</a>
            <a href={INSTITUTIONAL.emailHref} className="block break-all text-sm leading-relaxed transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}>{INSTITUTIONAL.email}</a>
            <a href={INSTITUTIONAL.instagramHref} target="_blank" rel="noopener noreferrer" className="block text-sm leading-relaxed transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}>Instagram</a>
          </div>
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 pb-6 pt-5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left" style={{ borderTop: "1px solid rgba(181,138,67,0.18)" }}>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(250,248,245,0.62)" }}>© {new Date().getFullYear()} {INSTITUTIONAL.name}. Todos los derechos reservados.</p>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(250,248,245,0.62)" }}>Desarrollado por AFdevelopers</p>
      </div>
    </div>
  );
}
