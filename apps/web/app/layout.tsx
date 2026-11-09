import type { Metadata } from "next";
import "./globals.css";
import { INSTITUTIONAL } from "../lib/institutional";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: { default: `${INSTITUTIONAL.name} — Capacitación Jurídica`, template: `%s | ${INSTITUTIONAL.name}` },
  description:
    "Estudio Jurídico Rozenblum: asesoramiento legal y capacitación jurídica on-demand con acceso inmediato al aula virtual.",
  ...(siteUrl ? { alternates: { canonical: "/" } } : {}),
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: INSTITUTIONAL.name,
    title: `${INSTITUTIONAL.name} — Capacitación Jurídica`,
    description: "Capacitación jurídica on-demand y novedades del estudio.",
    ...(siteUrl ? { url: siteUrl } : {}),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
