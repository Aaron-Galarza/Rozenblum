import AdminView from "../../features/admin/index";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Administración", robots: { index: false, follow: false } };

export default function AdminRoute() {
  return <AdminView />;
}
