import ProfesorView from "../../features/profesor/index";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Panel del profesor", robots: { index: false, follow: false } };

export default function ProfesorRoute() {
  return <ProfesorView />;
}
