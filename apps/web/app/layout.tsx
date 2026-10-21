import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estudio Jurídico Rozenblum — Capacitación Jurídica",
  description:
    "Estudio Jurídico Rozenblum: asesoramiento legal y capacitación jurídica on-demand con acceso inmediato al aula virtual.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
