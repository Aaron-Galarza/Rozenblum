import ConfirmacionPage from "../../features/ConfirmacionPage";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Confirmación de inscripción", robots: { index: false, follow: false } };

export default async function ConfirmacionRoute({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string; email?: string; payment_id?: string; collection_id?: string }>;
}) {
  const { orden, email, payment_id, collection_id } = await searchParams;
  return <ConfirmacionPage reference={orden} email={email} paymentId={payment_id ?? collection_id} />;
}
