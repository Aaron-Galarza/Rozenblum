"use client";

import type { AdminReportesDTO } from "@rozenblum/shared";

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
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline fill="none" stroke="#B58A43" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
      {points.map((v, i) => (
        <circle key={i} cx={(i / last) * w} cy={h - (v / max) * h} r="3" fill="#B58A43" />
      ))}
    </svg>
  );
}

export default function ReportesSection({ reportes }: { reportes: AdminReportesDTO }) {
  return (
    <>
      <h2 className="text-3xl font-light mb-8" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Reportes</h2>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-lg" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
          <h3 className="text-lg font-medium mb-4" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Ingresos por Mes</h3>
          <BarChart data={reportes.ingresosPorMes} />
        </div>
        <div className="p-6 rounded-lg" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
          <h3 className="text-lg font-medium mb-4" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Alumnos Nuevos por Mes</h3>
          <LineChart points={reportes.alumnosPorMes.map((point) => point.value)} />
        </div>
        <div className="p-6 rounded-lg" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
          <h3 className="text-lg font-medium mb-4" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Completion Rate por Curso</h3>
          <div className="space-y-3">
            {reportes.completionPorCurso.length === 0 ? (
              <p className="text-xs" style={{ color: "rgba(23,59,108,0.4)" }}>Sin datos todavía</p>
            ) : reportes.completionPorCurso.map(({ name, pct }) => (
              <div key={name}>
                <div className="flex justify-between text-xs mb-1" style={{ color: "#173B6C" }}><span>{name}</span><span style={{ color: "#B58A43" }}>{pct}%</span></div>
                <div className="w-full h-2 rounded-full" style={{ backgroundColor: "#E0E0E0" }}>
                  <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "#B58A43" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-6 rounded-lg" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
          <h3 className="text-lg font-medium mb-4" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Cursos Más Populares</h3>
          <div className="space-y-3">
            {reportes.cursosPopulares.length === 0 ? (
              <p className="text-xs" style={{ color: "rgba(23,59,108,0.4)" }}>Sin datos todavía</p>
            ) : reportes.cursosPopulares.map(({ name, count, color }) => (
              <div key={name} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs flex-1" style={{ color: "#173B6C" }}>{name}</span>
                <span className="text-xs font-bold" style={{ color: "#B58A43" }}>{count} alumnos</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
