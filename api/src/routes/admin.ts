import { Router } from "express";
import {
  adminCoursePatchSchema,
  adminUserPatchSchema,
  adminUserSchema,
  coursePayloadSchema,
  orderStatusSchema,
} from "@rozenblum/shared";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendData, sendPaginated, notFound } from "../lib/http.js";
import { parsePagination } from "../lib/pagination.js";
import {
  createAdminUser,
  getAdminOrderEvents,
  deleteAdminUser,
  listAdminUsers,
  updateAdminOrder,
  updateAdminUser,
} from "../services/admin.js";
import { listAdminEvents } from "../services/audit.js";
import { streamAdminExport } from "../services/admin-export.js";
import {
  getAdminOverview,
  listAdminEnrollments,
  listAdminOrders,
} from "../services/dashboard.js";
import {
  createEmptyCourseForAdmin,
  deleteCourse,
  getCourseByRequestId,
  updateCourse,
} from "../services/courses.js";
import { countContacts, listContacts } from "../services/contact.js";
import {
  asyncRoute,
  numericParam,
  parseBody,
  requestIdempotencyKey,
  requestRevision,
  type ApiRequest,
} from "./helpers.js";

export const adminRouter = Router();

/** Optional human explanation attached to a destructive administrative action. */
function requestReason(req: ApiRequest): string | undefined {
  const raw = req.query.reason;
  if (typeof raw !== "string") return undefined;
  const reason = raw.trim();
  return reason.length >= 5 && reason.length <= 500 ? reason : undefined;
}

adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get(
  "/overview",
  asyncRoute(async (req, res) => {
    const { overview, totals } = await getAdminOverview(parsePagination(req));
    res.setHeader("X-Total-Students", String(totals.alumnos));
    res.setHeader("X-Total-Professors", String(totals.profesores));
    res.setHeader("X-Total-Courses", String(totals.cursos));
    res.setHeader("X-Total-Orders", String(totals.orders));
    res.setHeader("X-Total-Enrollments", String(totals.inscripciones));
    sendData(res, overview);
  }),
);

adminRouter.get(
  "/enrollments",
  asyncRoute(async (req, res) => {
    const page = parsePagination(req);
    const { items, total } = await listAdminEnrollments(page);
    sendPaginated(res, items, total, page);
  }),
);

adminRouter.get(
  "/orders",
  asyncRoute(async (req, res) => {
    const page = parsePagination(req);
    const { items, total } = await listAdminOrders(page);
    sendPaginated(res, items, total, page);
  }),
);

const exportCsv = (kind: "orders" | "enrollments") => asyncRoute(async (_req, res) => {
  try {
    await streamAdminExport(res, kind);
  } catch (error) {
    if (res.headersSent) { res.destroy(error as Error); return; }
    throw error;
  }
});

adminRouter.get("/orders/export", exportCsv("orders"));
adminRouter.get("/enrollments/export", exportCsv("enrollments"));

adminRouter.get(
  "/contacts",
  asyncRoute(async (req, res) => {
    const page = parsePagination(req);
    sendPaginated(res, await listContacts(page), await countContacts(), page);
  }),
);

adminRouter.get(
  "/audit",
  asyncRoute(async (req, res) => {
    const page = parsePagination(req);
    const entity = req.query.entity === "user" || req.query.entity === "course"
      ? req.query.entity
      : undefined;
    const { events, total } = await listAdminEvents(page, entity);
    sendPaginated(res, events, total, page);
  }),
);

adminRouter.get(
  "/users",
  asyncRoute(async (req, res) => {
    const role = req.query.role;
    if (role !== "alumno" && role !== "profesor") {
      throw notFound("Especificá role=alumno o role=profesor.");
    }
    const page = parsePagination(req);
    const { users, total } = await listAdminUsers(role, page);
    sendPaginated(res, users, total, page);
  }),
);

adminRouter.post(
  "/users",
  asyncRoute(async (req, res) => {
    const input = parseBody(adminUserSchema, req.body);
    sendData(res, await createAdminUser(input, req.authUser!, requestReason(req)), 201);
  }),
);

adminRouter.patch(
  "/users/:id",
  asyncRoute(async (req, res) => {
    const patch = parseBody(adminUserPatchSchema, req.body);
    sendData(
      res,
      await updateAdminUser(req.params.id, patch, req.authUser!, requestReason(req)),
    );
  }),
);

adminRouter.delete(
  "/users/:id",
  asyncRoute(async (req, res) => {
    await deleteAdminUser(req.params.id, req.authUser!, requestReason(req));
    res.status(204).end();
  }),
);

adminRouter.post(
  "/courses",
  asyncRoute(async (req, res) => {
    const input = parseBody(coursePayloadSchema, req.body);
    const course = await createEmptyCourseForAdmin(
      input,
      requestIdempotencyKey(req),
      req.authUser!,
    );
    res.setHeader("ETag", `"${course.revision ?? 0}"`);
    sendData(res, course, 201);
  }),
);

/** Safe recovery for a course creation whose response was lost. */
adminRouter.get(
  "/courses/by-request-id/:requestId",
  asyncRoute(async (req, res) => {
    sendData(res, await getCourseByRequestId(req.params.requestId));
  }),
);

adminRouter.patch(
  "/courses/:courseId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const patch = parseBody(adminCoursePatchSchema, req.body);
    const course = await updateCourse(courseId, patch, req.authUser!, {
      expectedRevision: requestRevision(req),
    });
    res.setHeader("ETag", `"${course.revision ?? 0}"`);
    sendData(res, course);
  }),
);

adminRouter.delete(
  "/courses/:courseId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    await deleteCourse(courseId, req.authUser!, { expectedRevision: requestRevision(req) });
    res.status(204).end();
  }),
);

adminRouter.patch(
  "/orders/:id",
  asyncRoute(async (req, res) => {
    const input = parseBody(orderStatusSchema, req.body);
    await updateAdminOrder(req.params.id, input.estado, input.motivo, req.authUser!);
    sendData(res, { id: req.params.id, estado: input.estado });
  }),
);

adminRouter.get("/orders/:id/events", asyncRoute(async (req, res) => {
  sendData(res, await getAdminOrderEvents(req.params.id));
}));
