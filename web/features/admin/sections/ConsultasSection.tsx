"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, errorMessage } from "../../../lib/api";
import { ErrorPanel, LoadingScreen } from "../../../components/ui/AsyncState";

type Contact = {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
};

const PAGE_SIZE = 50;

export default function ConsultasSection() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (offset: number) => {
    setError("");
    setBusy(true);
    try {
      const page = await apiFetch<Contact[]>(`/api/admin/contacts?limit=${PAGE_SIZE}&offset=${offset}`, { auth: true });
      setContacts((current) => offset === 0 ? page : [...current, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(0); }, [load]);

  if (loading) return <LoadingScreen label="Cargando consultas..." />;
  if (error && contacts.length === 0) return <ErrorPanel message={error} onRetry={() => void load(0)} />;

  return (
    <section>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-medium" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Consultas recibidas</h2>
          <p className="text-xs mt-1" style={{ color: "rgba(23,59,108,0.6)" }}>Mensajes enviados desde el formulario de contacto.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void load(0)} className="px-4 py-2 text-xs font-bold tracking-wide disabled:opacity-50" style={{ border: "1px solid #B58A43", color: "#173B6C" }}>ACTUALIZAR</button>
      </div>
      {error && <p role="alert" className="text-sm mb-4" style={{ color: "#991b1b" }}>{error}</p>}
      {contacts.length === 0 ? (
        <p className="p-6 text-sm" style={{ backgroundColor: "#FFFFFF", color: "rgba(23,59,108,0.65)" }}>Todavía no hay consultas.</p>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <article key={contact.id} className="p-5 rounded" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.1)" }}>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "#173B6C" }}>{contact.name}</h3>
                  <a className="text-xs underline underline-offset-2" style={{ color: "#B58A43" }} href={`mailto:${contact.email}`}>{contact.email}</a>
                </div>
                <time className="text-xs" style={{ color: "rgba(23,59,108,0.55)" }} dateTime={contact.createdAt}>{new Date(contact.createdAt).toLocaleString("es-AR")}</time>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words" style={{ color: "rgba(23,59,108,0.8)" }}>{contact.message}</p>
            </article>
          ))}
          {hasMore && <button type="button" disabled={busy} onClick={() => void load(contacts.length)} className="w-full py-3 text-xs font-bold tracking-wide disabled:opacity-50" style={{ border: "1px solid #B58A43", color: "#173B6C" }}>{busy ? "CARGANDO..." : "CARGAR MÁS"}</button>}
        </div>
      )}
    </section>
  );
}
