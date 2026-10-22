"use client";

import { usePublicSettings } from "../../lib/use-public-settings";

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
      <div className="max-w-7xl mx-auto px-6 py-12 grid sm:grid-cols-3 gap-10">
        <div className="flex flex-col gap-4">
          {settings?.logoUrl && <img src={settings.logoUrl} alt={settings.companyName} className="h-10 w-auto object-contain" style={{ filter: "brightness(0) invert(1)", opacity: 0.75 }} />}
          <p className="text-xs leading-relaxed" style={{ color: "rgba(250,248,245,0.45)" }}>{tagline}</p>
          <div className="flex gap-2 mt-1">
            {[{ label: "Facebook", d: "M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" }, { label: "Instagram", d: "M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zM17.5 6.5h.01M6.5 2h11A3.5 3.5 0 0121 5.5v11a3.5 3.5 0 01-3.5 3.5h-11A3.5 3.5 0 013 16.5v-11A3.5 3.5 0 016.5 2z" }, { label: "LinkedIn", d: "M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 6a2 2 0 100-4 2 2 0 000 4z" }].map(({ label, d }) => (
              <button key={label} aria-label={label} className="w-9 h-9 flex items-center justify-center transition-all duration-200 hover:scale-110 hover:brightness-125" style={{ backgroundColor: "rgba(181,138,67,0.12)", border: "1px solid rgba(181,138,67,0.22)", color: "#B58A43" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4"><path d={d} /></svg>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium tracking-[0.2em] uppercase mb-5" style={{ color: "#B58A43" }}>Navegación</p>
          <ul className="space-y-2.5">
            {NAV_LINKS.map((link) => (
              <li key={link}>
                <button onClick={() => { if (link === "Cursos") { goToAula(); return; } scrollTo(link.toLowerCase().replace("á","a").replace("é","e").replace("ó","o").replace("ú","u").replace("í","i")); }} className="text-xs tracking-wide transition-opacity duration-200 hover:opacity-100" style={{ color: "rgba(250,248,245,0.5)" }}>{link}</button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium tracking-[0.2em] uppercase mb-5" style={{ color: "#B58A43" }}>Contacto Rápido</p>
          <div className="space-y-3">
            {["C. Corrientes 1177, H3500 Resistencia, Chaco", "0362 15-466-8878", "Lun–Vie: 7:30–12:00 · 17:00–20:00"].map((v) => (
              <p key={v} className="text-xs leading-relaxed" style={{ color: "rgba(250,248,245,0.5)" }}>{v}</p>
            ))}
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 pb-6 flex flex-col sm:flex-row items-center justify-between gap-2" style={{ borderTop: "1px solid rgba(181,138,67,0.1)" }}>
        <p className="text-xs pt-5" style={{ color: "rgba(250,248,245,0.28)" }}>© {new Date().getFullYear()} Estudio Jurídico Rozenblum. Todos los derechos reservados.</p>
        <p className="text-xs pt-5" style={{ color: "rgba(250,248,245,0.2)" }}>Matrícula N.º 4821 · Colegio de Abogados del Chaco</p>
      </div>
    </div>
  );
}
