"use client";

import { useState } from "react";
import type { OrderDTO, OrderStatus } from "@rozenblum/shared";
import { downloadAuthenticatedFile, errorMessage } from "../../../lib/api";
import Toast from "../../../components/ui/Toast";
import { useToast } from "../../../lib/use-toast";
import Modal from "../../../components/ui/Modal";

const ORDER_STATUSES: OrderStatus[] = ["Pagado", "Pendiente", "Rechazado", "En disputa", "Reembolsado"];

function orderDateISO(label: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(label);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
}

const statusBadgeStyle: Record<OrderStatus, React.CSSProperties> = {
  Pagado: { backgroundColor: "#dcfce7", color: "#166534" },
  Pendiente: { backgroundColor: "#fef3c7", color: "#92400e" },
  Rechazado: { backgroundColor: "#fee2e2", color: "#991b1b" },
  "En disputa": { backgroundColor: "#ffedd5", color: "#9a3412" },
  Reembolsado: { backgroundColor: "#e0e7ff", color: "#3730a3" },
};

type PagosSectionProps = {
  orders: OrderDTO[];
  onStatusChange: (id: string, estado: OrderStatus, motivo: string) => Promise<void>;
};

export default function PagosSection({ orders, onStatusChange }: PagosSectionProps) {
  const [metodoFilter, setMetodoFilter] = useState("Todos");
  const [estadoFilter, setEstadoFilter] = useState("Todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { toast, showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pending, setPending] = useState<{ order: OrderDTO; estado: OrderStatus } | null>(null);
  const [motivo, setMotivo] = useState("");


  const filtered = orders.filter((o) => {
    const matchMetodo = metodoFilter === "Todos" || o.metodo === metodoFilter;
    const matchEstado = estadoFilter === "Todos" || o.estado === estadoFilter;
    const orderDate = orderDateISO(o.fecha);
    const matchFrom = !dateFrom || (orderDate !== "" && orderDate >= dateFrom);
    const matchTo = !dateTo || (orderDate !== "" && orderDate <= dateTo);
    return matchMetodo && matchEstado && matchFrom && matchTo;
  });

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadAuthenticatedFile("/api/admin/orders/export", "ordenes-rozenblum.csv");
    } catch (error) {
      showToast(errorMessage(error), true);
    } finally {
      setExporting(false);
    }
  };

  const metodos = ["Todos", ...Array.from(new Set(orders.map((o) => o.metodo)))];
  const estados = ["Todos", ...Array.from(new Set(orders.map((o) => o.estado)))];

  const selectStyle: React.CSSProperties = { border: "1px solid rgba(23,59,108,0.2)", color: "#173B6C", backgroundColor: "#FAF8F5" };

  const changeStatus = async () => {
    if (!pending || motivo.trim().length < 5) return;
    setBusy(true);
    try {
      await onStatusChange(pending.order.id, pending.estado, motivo.trim());
      showToast(pending.estado === "Pagado" ? "✓ Orden confirmada · inscripción activada" : `Orden actualizada a ${pending.estado}`);
      setPending(null);
      setMotivo("");
    } catch (err) {
      showToast(errorMessage(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-3xl font-light" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Pagos / Órdenes</h2>
        <button
          onClick={() => { void exportCsv(); }}
          disabled={exporting}
          className="px-5 py-2.5 text-xs font-medium border hover:opacity-70 transition-opacity flex items-center gap-2 disabled:opacity-50"
          style={{ color: "#173B6C", borderColor: "#173B6C" }}
          title="Descarga todas las órdenes, incluso las que no están en esta página"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          {exporting ? "Exportando..." : "Exportar todas las órdenes"}
        </button>
      </div>
      <div className="flex flex-wrap gap-3 mb-6">
        <select aria-label="Filtrar por método" value={metodoFilter} onChange={(e) => setMetodoFilter(e.target.value)} className="px-3 py-2 text-xs outline-none" style={selectStyle}>
          {metodos.map((m) => <option key={m} value={m}>{m === "Todos" ? "Por Método ▼" : m}</option>)}
        </select>
        <select aria-label="Filtrar por estado" value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} className="px-3 py-2 text-xs outline-none" style={selectStyle}>
          {estados.map((s) => <option key={s} value={s}>{s === "Todos" ? "Por Estado ▼" : s}</option>)}
        </select>
        <input type="date" aria-label="Desde" max={dateTo || undefined} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 text-xs outline-none" style={selectStyle} />
        <span className="py-2 text-xs" style={{ color: "rgba(23,59,108,0.5)" }}>—</span>
        <input type="date" aria-label="Hasta" min={dateFrom || undefined} value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 text-xs outline-none" style={selectStyle} />
        {(metodoFilter !== "Todos" || estadoFilter !== "Todos" || dateFrom || dateTo) && (
          <button onClick={() => { setMetodoFilter("Todos"); setEstadoFilter("Todos"); setDateFrom(""); setDateTo(""); }} className="text-xs underline hover:opacity-60 transition-opacity" style={{ color: "#B58A43" }}>
            Limpiar
          </button>
        )}
      </div>
      <div className="rounded-lg overflow-hidden shadow-sm" style={{ border: "1px solid rgba(23,59,108,0.08)" }}>
        <table className="w-full text-xs">
          <thead><tr style={{ backgroundColor: "#173B6C" }}>
            {["Número", "Alumno", "Curso", "Monto", "Fecha", "Método", "Estado"].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: "#FAF8F5" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs" style={{ color: "rgba(23,59,108,0.4)" }}>No se encontraron órdenes con los filtros aplicados</td></tr>
            ) : filtered.map((o, i) => (
              <tr key={o.id} style={{ backgroundColor: i % 2 === 0 ? "#FFFFFF" : "#F5F5F5" }}>
                <td className="px-4 py-3 font-mono font-medium" style={{ color: "#173B6C" }}>{o.externalReference ?? o.id}</td>
                <td className="px-4 py-3" style={{ color: "#173B6C" }}>{o.alumno}</td>
                <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.7)" }}>{o.curso}</td>
                <td className="px-4 py-3 font-medium" style={{ color: "#B58A43" }}>{o.monto}</td>
                <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.6)" }}>{o.fecha}</td>
                <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.6)" }}>{o.metodo}</td>
                <td className="px-4 py-3">
                  <select
                    value={o.estado}
                    disabled={busy || o.paymentProvider === "mercadopago" || o.estado === "En disputa"}
                    onChange={(e) => { setPending({ order: o, estado: e.target.value as OrderStatus }); setMotivo(""); }}
                    className="px-2 py-0.5 rounded text-[10px] font-bold outline-none cursor-pointer border-0 disabled:opacity-40"
                    style={statusBadgeStyle[o.estado]}
                    aria-label={`Estado de la orden ${o.externalReference ?? o.id}`}
                    title={o.paymentProvider === "mercadopago" ? "Estado automático verificado por Mercado Pago" : undefined}
                  >
                    {ORDER_STATUSES.map((status) => (
                      <option key={status} value={status}
                        disabled={status === "En disputa" ||
                          (o.estado === "Reembolsado" && status !== "Reembolsado") ||
                          (o.estado === "Pagado" && status !== "Pagado" && status !== "Reembolsado") ||
                          ((o.estado === "Pendiente" || o.estado === "Rechazado") && status === "Reembolsado")}
                        style={{ backgroundColor: "#FFFFFF", color: "#173B6C" }}>{status}</option>
                    ))}
                  </select>
                  {o.fulfillmentIssue === "course_closed" && o.estado === "Pagado" &&
                    <span className="mt-1 block text-[10px] font-semibold" style={{ color: "#72132C" }}>
                      Curso cerrado · sin acceso · revisar cobro
                    </span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && <Toast message={toast.text} error={toast.error} />}
      {pending && (
        <Modal title="Confirmar cambio de pago" onClose={() => { if (!busy) setPending(null); }}>
          <form onSubmit={(event) => { event.preventDefault(); void changeStatus(); }} className="space-y-4">
            <p className="text-sm" style={{ color: "#173B6C" }}>
              Orden {pending.order.externalReference ?? pending.order.id}: {pending.order.estado} → {pending.estado}
            </p>
            <label htmlFor="payment-reason" className="block text-xs font-medium uppercase tracking-widest" style={{ color: "#173B6C" }}>Motivo del cambio</label>
            <textarea id="payment-reason" required minLength={5} maxLength={500} value={motivo}
              onChange={(event) => setMotivo(event.target.value)} rows={3}
              className="w-full rounded border p-3 text-sm outline-none" style={{ borderColor: "rgba(23,59,108,0.25)", color: "#173B6C" }} />
            <button type="submit" disabled={busy || motivo.trim().length < 5}
              className="w-full rounded px-4 py-3 text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: "#173B6C", color: "#FFFFFF" }}>
              {busy ? "Guardando..." : "Confirmar cambio"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
