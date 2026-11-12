import type { Metadata } from "next";
import LegalDocumentPage from "../../features/legal/LegalDocumentPage";
import { termsSections } from "../../features/legal/legal-content";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
  description: "Borrador de Términos y Condiciones de Uso del Estudio Jurídico Rozenblum, sujeto a revisión y aprobación.",
  robots: { index: false, follow: false },
};

export default function TermsAndConditionsPage() {
  return <LegalDocumentPage title="Términos y Condiciones de Uso — Estudio Jurídico Rozenblum" sections={termsSections} alternateHref="/politica-de-privacidad" alternateLabel="Leer Política de Privacidad" />;
}
