import ConfirmacionPage from "../../features/ConfirmacionPage";

export default async function ConfirmacionRoute({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string; email?: string }>;
}) {
  const { orden, email } = await searchParams;
  return <ConfirmacionPage reference={orden} email={email} />;
}
