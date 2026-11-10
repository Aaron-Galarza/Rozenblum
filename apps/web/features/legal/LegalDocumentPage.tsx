import Link from "next/link";
import PublicHeader from "../../components/layout/PublicHeader";
import SimpleFooter from "../../components/layout/SimpleFooter";
import type { LegalSection } from "./legal-content";

type LegalDocumentPageProps = {
  title: string;
  sections: LegalSection[];
  alternateHref: string;
  alternateLabel: string;
};

function LinkedContactText({ text }: { text: string }) {
  const pattern = /(estudiojuridicorozenblum@gmail\.com|\+54 9 362 466-8878)/g;
  return text.split(pattern).map((part, index) => {
    if (part === "estudiojuridicorozenblum@gmail.com") {
      return <a key={index} href="mailto:estudiojuridicorozenblum@gmail.com" className="break-all underline underline-offset-4 hover:text-[#9A7435]">{part}</a>;
    }
    if (part === "+54 9 362 466-8878") {
      return <a key={index} href="tel:+5493624668878" className="underline underline-offset-4 hover:text-[#9A7435]">{part}</a>;
    }
    return part;
  });
}

export default function LegalDocumentPage({ title, sections, alternateHref, alternateLabel }: LegalDocumentPageProps) {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
      <PublicHeader rightSlot={
        <Link href="/" className="flex min-h-11 items-center px-3 text-xs font-medium tracking-wide transition-colors hover:text-[#9A7435]" style={{ color: "#173B6C" }}>
          Volver al inicio
        </Link>
      } />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        <header className="mb-8 border-b pb-7 sm:mb-10" style={{ borderColor: "rgba(23,59,108,0.12)" }}>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "#9A7435" }}>Estudio Jurídico Rozenblum</p>
          <h1 className="text-3xl font-light leading-tight sm:text-4xl" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{title}</h1>
          <p className="mt-4 border-l-2 px-3 py-2 text-xs leading-relaxed sm:text-sm" style={{ borderColor: "#B58A43", color: "rgba(23,59,108,0.68)", backgroundColor: "rgba(181,138,67,0.07)" }}>
            Borrador sujeto a revisión y aprobación del Estudio Jurídico Rozenblum.
          </p>
        </header>

        <div className="space-y-8 sm:space-y-9">
          {sections.map((section) => (
            <section key={section.heading} aria-labelledby={`legal-${section.heading.replace(/\W+/g, "-")}`}>
              <h2 id={`legal-${section.heading.replace(/\W+/g, "-")}`} className="mb-3 text-xl font-medium leading-snug sm:text-2xl" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>
                {section.heading}
              </h2>
              <div className="space-y-3 text-sm leading-7 sm:text-base" style={{ color: "rgba(23,59,108,0.82)" }}>
                {section.blocks.map((block, index) => block.type === "paragraph" ? (
                  <p key={index}><LinkedContactText text={block.text} /></p>
                ) : (
                  <ul key={index} className="list-disc space-y-2 pl-5 marker:text-[#B58A43]">
                    {block.items.map((item) => <li key={item} className="pl-1">{item}</li>)}
                  </ul>
                ))}
              </div>
            </section>
          ))}
        </div>

        <nav aria-label="Más información legal" className="mt-12 flex flex-col gap-3 border-t pt-6 text-sm sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "rgba(23,59,108,0.12)" }}>
          <Link href={alternateHref} className="min-h-11 inline-flex items-center underline underline-offset-4 hover:text-[#9A7435]" style={{ color: "#173B6C" }}>{alternateLabel}</Link>
          <Link href="/catalogo" className="min-h-11 inline-flex items-center underline underline-offset-4 hover:text-[#9A7435]" style={{ color: "#173B6C" }}>Ver catálogo de cursos</Link>
        </nav>
      </main>
      <SimpleFooter />
    </div>
  );
}
