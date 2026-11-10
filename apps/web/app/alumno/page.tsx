import AlumnoView from "../../features/alumno/index";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Aula del alumno", robots: { index: false, follow: false } };

export default function AlumnoRoute() {
  return <AlumnoView />;
}
