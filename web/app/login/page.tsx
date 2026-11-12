import type { Metadata } from "next";
import LoginPage from "../../features/LoginPage";

export const metadata: Metadata = { title: "Iniciar sesión", robots: { index: false, follow: false } };

export default function LoginRoute() {
  return <LoginPage />;
}
