import type { Response } from "express";
import { getRepositories } from "../repositories/index.js";

type ExportKind = "orders" | "enrollments";

/** Quote every field and neutralize spreadsheet formulas from user input. */
function csvCell(value: string | number | undefined): string {
  const text = String(value ?? "");
  const first = text.trimStart().replaceAll("\u0000", "")[0];
  const safe = first && "=+@-".includes(first) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function csvRow(values: (string | number | undefined)[]): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}

async function writeRow(res: Response, row: string): Promise<void> {
  if (res.destroyed || res.write(row)) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      res.off("drain", done);
      res.off("close", done);
      resolve();
    };
    res.once("drain", done);
    res.once("close", done);
  });
}

/** Full CSV export with bounded memory and the same visibility rules as admin lists. */
export async function streamAdminExport(res: Response, kind: ExportKind): Promise<void> {
  const repos = getRepositories();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="rozenblum-${kind}.csv"`);
  res.setHeader("Cache-Control", "no-store");
  await writeRow(res, "\uFEFF");

  if (kind === "orders") {
    await writeRow(res, csvRow([
      "ID", "Referencia", "Alumno", "Correo", "Curso", "ID curso", "Monto centavos",
      "Estado", "Fecha", "Proveedor", "ID pago",
    ]));
    for await (const order of repos.orders.iterateVisibleForAdmin()) {
      if (res.destroyed) break;
      await writeRow(res, csvRow([
        order.id, order.externalReference, order.alumno, order.email, order.curso,
        order.courseId, order.montoCents, order.estado, order.createdAt,
        order.paymentProvider, order.paymentId,
      ]));
    }
  } else {
    await writeRow(res, csvRow([
      "ID", "Alumno", "Correo", "ID curso", "Estado", "Inicio", "Vencimiento",
      "Lecciones completadas",
    ]));
    for await (const enrollment of repos.enrollments.iterateVisibleForAdmin()) {
      if (res.destroyed) break;
      await writeRow(res, csvRow([
        enrollment.id, enrollment.studentName, enrollment.studentEmail, enrollment.courseId,
        enrollment.status, enrollment.startedAt, enrollment.expiresAt,
        enrollment.completedLessonIds.length,
      ]));
    }
  }
  if (!res.destroyed) res.end();
}
