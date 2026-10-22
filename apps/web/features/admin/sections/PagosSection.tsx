"use client";

import { useState } from "react";
import type { OrderDTO, OrderStatus } from "@rozenblum/shared";
import { errorMessage } from "../../../lib/api";
import Toast from "../../../components/ui/Toast";

const ORDER_STATUSES: OrderStatus[] = ["Pagado", "Pendiente", "Rechazado", "Reembolsado"];

function orderDateISO(label: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(label);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
}

function csvCell(value: string): string {
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

const statusBadgeStyle: Record<OrderStatus, React.CSSProperties> = {
  Pagado: { backgroundColor: "#dcfce7", color: "#166534" },
  Pendiente: { backgroundColor: "#fef3c7", color: "#92400e" },
  Rechazado: { backgroundColor: "#fee2e2", color: "#991b1b" },
  Reembolsado: { backgroundColor: "#e0e7ff", color: "#3730a3" },
};

type PagosSectionProps = {
  orders: OrderDTO[];
  onStatusChange: (id: string, estado: OrderStatus) => Promise<void>;
};

export default function PagosSection({ orders, onStatusChange }: PagosSectionProps) {
  const [metodoFilter, setMetodoFilter] = useState("Todos");
  const [estadoFilter, setEstadoFilter] = useState("Todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const showToast = (text: string, error = false) => { setToast({ text, error }); setTimeout(() => setToast(null), 2500); };

  const filtered = orders.filter((o) => {
    const matchMetodo = metodoFilter === "Todos" || o.metodo === metodoFilter;
    const matchEstado = estadoFilter === "Todos" || o.estado === estadoFilter;
    const orderDate = orderDateISO(o.fecha);
    const matchFrom = !dateFrom || (orderDate !== "" && orderDate >= dateFrom);
    const matchTo = !dateTo || (orderDate !== "" && orderDate <= dateTo);
    return matchMetodo && matchEstado && matchFrom && matchTo;
  });

  const exportCsv = () => {
    const rows = [
      ["Número", "Alumno", "Curso", "Monto", "Fecha", "Método", "Estado"],
      ...filtered.map((order) => [order.externalReference ?? order.id, order.alumno, order.curso, order.monto, order.fecha, order.metodo, order.estado]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ordenes-rozenblum.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const metodos = ["Todos", ...Array.from(new Set(orders.map((o) => o.metodo)))];
  const estados = ["Todos", ...Array.from(new Set(orders.map((o) => o.estado)))];

  const selectStyle: React.CSSProperties = { border: "1px solid rgba(23,59,108,0.2)", color: "#173B6C", backgroundColor: "#FAF8F5" };

  const changeStatus = async (order: OrderDTO, estado: OrderStatus) => {
    if (estado === order.estado) return;
    setBusy(true);
    try {
      await onStatusChange(order.id, estado);
      showToast(estado === "Pagado" ? "✓ Orden confirmada · inscripción activada" : `Orden actualizada a ${estado}`);
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
          onClick={exportCsv}
          className="px-5 py-2.5 text-xs font-medium border hover:opacity-70 transition-opacity flex items-center gap-2"
          style={{ color: "#173B6C", borderColor: "#173B6C" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          Exportar CSV
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
                    disabled={busy}
                    onChange={(e) => void changeStatus(o, e.target.value as OrderStatus)}
                    className="px-2 py-0.5 rounded text-[10px] font-bold outline-none cursor-pointer border-0 disabled:opacity-40"
                    style={statusBadgeStyle[o.estado]}
                    aria-label={`Estado de la orden ${o.externalReference ?? o.id}`}
                  >
                    {ORDER_STATUSES.map((status) => (
                      <option key={status} value={status} style={{ backgroundColor: "#FFFFFF", color: "#173B6C" }}>{status}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && <Toast message={toast.text} error={toast.error} />}
    </>
  );
}
