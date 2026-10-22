"use client";

import type { AdminDashboardDTO } from "@rozenblum/shared";

// Simple inline bar chart using CSS
function BarChart({ data }: { data: { month: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((point) => point.value));
  return (
    <div className="flex items-end justify-between gap-3 h-36 px-2">
      {data.map(({ month, value }) => (
        <div key={month} className="flex flex-col items-center gap-1 flex-1">
          <span className="text-[10px]" style={{ color: "#B58A43" }}>${value}k</span>
          <div className="w-full rounded-t transition-all duration-500" style={{ height: `${(value / max) * 100}%`, backgroundColor: "#B58A43", opacity: 0.85 }} />
          <span className="text-[10px]" style={{ color: "rgba(23,59,108,0.55)" }}>{month}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ points }: { points: number[] }) {
  const max = Math.max(1, ...points);
  const w = 280; const h = 100;
  const last = Math.max(1, points.length - 1);
  const pts = points.map((v, i) => `${(i / last) * w},${h - (v / max) * h}`).join(" ");
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return (
    <>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <polyline fill="none" stroke="#B58A43" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
        {points.map((v, i) => (
          <circle key={i} cx={(i / last) * w} cy={h - (v / max) * h} r="3" fill="#B58A43" />
        ))}
      </svg>
      <div className="flex justify-between mt-2 px-1">
        {months.map((m) => (
          <span key={m} className="text-[9px]" style={{ color: "rgba(23,59,108,0.4)" }}>{m}</span>
        ))}
      </div>
    </>
  );
}

type DashboardSectionProps = {
  dashboard: AdminDashboardDTO;
  tableTab: "ordenes" | "inscripciones";
  onTableTabChange: (tab: "ordenes" | "inscripciones") => void;
};

export default function DashboardSection({ dashboard, tableTab, onTableTabChange }: DashboardSectionProps) {
  const { orders, inscripciones, reportes } = dashboard;

  const cards = [
    { label: "Total Ingresos", value: dashboard.totalIngresos, sub: "Total cobrado", trend: dashboard.ingresosTrend },
    { label: "Alumnos Activos", value: String(dashboard.alumnosActivos), sub: "Total", trend: dashboard.alumnosTrend },
    { label: "Cursos Publicados", value: String(dashboard.cursosPublicados), sub: `${dashboard.cursosBorrador} en borrador` },
    { label: "Nuevas Inscripciones", value: String(dashboard.nuevasInscripciones), sub: "Últimos 7 días" },
  ];

  return (
    <>
      <h2 className="text-3xl font-light mb-8" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Dashboard</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        {cards.map(({ label, value, sub, trend }) => (
          <div key={label} className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
            <p className="text-4xl font-light" style={{ color: "#B58A43", fontFamily: "'Cormorant Garamond', serif" }}>{value}</p>
            <p className="text-xs font-bold mt-1 mb-0.5" style={{ color: "#173B6C" }}>{label}</p>
            <p className="text-xs" style={{ color: "rgba(23,59,108,0.5)" }}>{sub}</p>
            {trend && <p className="text-xs mt-1 font-medium" style={{ color: "#B58A43" }}>↑ {trend}</p>}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="p-6 rounded-lg" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
          <h3 className="text-lg font-medium mb-4" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Ingresos por Mes (miles $)</h3>
          <BarChart data={reportes.ingresosPorMes} />
        </div>
        <div className="p-6 rounded-lg" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
          <h3 className="text-lg font-medium mb-4" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Alumnos Nuevos por Mes</h3>
          <LineChart points={reportes.alumnosPorMes.map((point) => point.value)} />
        </div>
      </div>

      {/* Table tabs */}
      <div className="rounded-lg overflow-hidden shadow-sm" style={{ border: "1px solid rgba(23,59,108,0.08)" }}>
        <div className="flex" style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid rgba(23,59,108,0.08)" }}>
          {[["ordenes", "Últimas Órdenes"], ["inscripciones", "Últimas Inscripciones"]].map(([key, label]) => (
            <button key={key} onClick={() => onTableTabChange(key as "ordenes" | "inscripciones")} className="px-6 py-3.5 text-xs font-medium tracking-wide transition-all" style={{ color: tableTab === key ? "#B58A43" : "rgba(23,59,108,0.5)", borderBottom: tableTab === key ? "2px solid #B58A43" : "2px solid transparent" }}>
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          {tableTab === "ordenes" ? (
            <table className="w-full text-xs">
              <thead><tr style={{ backgroundColor: "#173B6C" }}>
                {["Número", "Alumno", "Curso", "Monto", "Fecha", "Método", "Estado"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: "#FAF8F5" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-xs" style={{ color: "rgba(23,59,108,0.4)" }}>Todavía no hay órdenes registradas</td></tr>
                ) : orders.map((o, i) => (
                  <tr key={o.id} style={{ backgroundColor: i % 2 === 0 ? "#FFFFFF" : "#F5F5F5" }}>
                    <td className="px-4 py-3 font-mono font-medium" style={{ color: "#173B6C" }}>{o.externalReference ?? o.id}</td>
                    <td className="px-4 py-3" style={{ color: "#173B6C" }}>{o.alumno}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.7)" }}>{o.curso}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: "#B58A43" }}>{o.monto}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.6)" }}>{o.fecha}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.6)" }}>{o.metodo}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold" style={o.estado === "Pagado" ? { backgroundColor: "#dcfce7", color: "#166534" } : { backgroundColor: "#fef3c7", color: "#92400e" }}>✓ {o.estado}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs">
              <thead><tr style={{ backgroundColor: "#173B6C" }}>
                {["Alumno", "Curso", "Fecha", "Docente", "Estado"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: "#FAF8F5" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {inscripciones.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-xs" style={{ color: "rgba(23,59,108,0.4)" }}>Todavía no hay inscripciones</td></tr>
                ) : inscripciones.map((ins, i) => (
                  <tr key={ins.id} style={{ backgroundColor: i % 2 === 0 ? "#FFFFFF" : "#F5F5F5" }}>
                    <td className="px-4 py-3" style={{ color: "#173B6C" }}>{ins.alumno}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.7)" }}>{ins.curso}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.6)" }}>{ins.fecha}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.6)" }}>{ins.docente}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: "#dbeafe", color: "#1e40af" }}>{ins.estado}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
