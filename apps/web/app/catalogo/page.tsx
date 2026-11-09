import CatalogPage from "../../features/catalog/index";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Catálogo de cursos",
  description: "Explorá los cursos de capacitación jurídica del Estudio Jurídico Rozenblum.",
  openGraph: { title: "Catálogo de cursos", description: "Capacitación jurídica on-demand." },
  ...(process.env.NEXT_PUBLIC_SITE_URL ? { alternates: { canonical: "/catalogo" } } : {}),
};

export default function CatalogoPage() {
  return <CatalogPage />;
}
