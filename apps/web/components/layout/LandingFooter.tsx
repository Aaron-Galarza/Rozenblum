"use client";

import Link from "next/link";
import BrandLogo from "../ui/BrandLogo";
import { IconArrowUpRight, IconInstagram, IconMail, IconMapPin, IconPhone, IconWhatsApp } from "../icons";
import { INSTITUTIONAL } from "../../lib/institutional";

const NAV_LINKS = ["Inicio", "Áreas", "Nosotros", "Equipo", "Cursos", "Contacto"];

type LandingFooterProps = {
  scrollTo: (id: string) => void;
  goToAula: () => void;
  tagline?: string;
};

export default function LandingFooter({ scrollTo, goToAula, tagline }: LandingFooterProps) {
  const navigate = (link: string) => {
    if (link === "Cursos") return goToAula();
    scrollTo(link.toLowerCase().replace("á", "a").replace("é", "e").replace("ó", "o").replace("ú", "u").replace("í", "i"));
  };

  return (
    <div className="relative overflow-hidden" style={{ borderTop: "1px solid rgba(181,138,67,0.24)" }}>
      <div aria-hidden="true" className="absolute -bottom-44 -left-32 h-80 w-80 rounded-full border" style={{ borderColor: "rgba(181,138,67,0.12)" }} />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-6 sm:py-16 lg:grid-cols-12 lg:gap-x-10 lg:gap-y-12">
        <div className="flex flex-col gap-5 lg:col-span-4">
          <BrandLogo className="h-10 w-auto self-start object-contain" inverted />
          <p className="max-w-sm text-sm leading-relaxed" style={{ color: "rgba(250,248,245,0.68)" }}>
            {tagline || "Asesoramiento jurídico y capacitación para profesionales del derecho."}
          </p>
          <div className="flex items-center gap-2">
            <a href={INSTITUTIONAL.whatsappHref} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp" className="flex h-10 w-10 items-center justify-center border transition-all hover:-translate-y-0.5 hover:bg-[#25D366] hover:text-white" style={{ borderColor: "rgba(181,138,67,0.45)", color: "#D4A855" }}><IconWhatsApp className="h-[18px] w-[18px]" /></a>
            <a href={INSTITUTIONAL.instagramHref} target="_blank" rel="noopener noreferrer" aria-label="Visitar Instagram" className="flex h-10 w-10 items-center justify-center border transition-all hover:-translate-y-0.5 hover:bg-[#d62976] hover:text-white" style={{ borderColor: "rgba(181,138,67,0.45)", color: "#D4A855" }}><IconInstagram className="h-[18px] w-[18px]" /></a>
          </div>
        </div>

        <div className="lg:col-span-2">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "#D4A855" }}>Navegación</p>
          <ul className="space-y-1">
            {NAV_LINKS.map((link) => <li key={link}><button onClick={() => navigate(link)} className="min-h-10 py-2 text-left text-sm tracking-wide transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}>{link}</button></li>)}
          </ul>
        </div>

        <div className="lg:col-span-2">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "#D4A855" }}>Información legal</p>
          <ul className="space-y-1">
            <li><Link href="/politica-de-privacidad" className="inline-flex min-h-10 items-center py-2 text-sm tracking-wide transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}>Política de Privacidad</Link></li>
            <li><Link href="/terminos-y-condiciones" className="inline-flex min-h-10 items-center py-2 text-sm tracking-wide transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}>Términos y Condiciones</Link></li>
          </ul>
        </div>

        <div className="lg:col-span-4">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "#D4A855" }}>Contacto</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <a href={INSTITUTIONAL.mapsHref} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 py-1 transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}><IconMapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#D4A855" }} /><span className="text-sm leading-relaxed">{INSTITUTIONAL.address}</span><IconArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" /></a>
            <a href={INSTITUTIONAL.phoneHref} className="flex items-start gap-3 py-1 transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}><IconPhone className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#D4A855" }} /><span className="text-sm leading-relaxed">{INSTITUTIONAL.phone}</span></a>
            <a href={INSTITUTIONAL.emailHref} className="flex items-start gap-3 py-1 transition-colors hover:text-white" style={{ color: "rgba(250,248,245,0.72)" }}><IconMail className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#D4A855" }} /><span className="break-all text-sm leading-relaxed">{INSTITUTIONAL.email}</span></a>
          </div>
        </div>
      </div>
      <div className="relative mx-auto flex max-w-7xl flex-col gap-3 px-5 py-5 text-center sm:px-6 sm:text-left lg:flex-row lg:items-center lg:justify-between" style={{ borderTop: "1px solid rgba(181,138,67,0.18)" }}>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(250,248,245,0.52)" }}>© {new Date().getFullYear()} {INSTITUTIONAL.name}. Todos los derechos reservados.</p>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(250,248,245,0.52)" }}>Desarrollado por AFdevelopers</p>
      </div>
    </div>
  );
}
