import type { Metadata } from "next";
import LegalDocumentPage from "../../features/legal/LegalDocumentPage";
import { privacySections } from "../../features/legal/legal-content";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description: "Borrador de Política de Privacidad del Estudio Jurídico Rozenblum, sujeto a revisión y aprobación.",
  robots: { index: false, follow: false },
};

export default function PrivacyPolicyPage() {
  return <LegalDocumentPage title="Política de Privacidad del Estudio Jurídico Rozenblum" sections={privacySections} alternateHref="/terminos-y-condiciones" alternateLabel="Leer Términos y Condiciones" />;
}
