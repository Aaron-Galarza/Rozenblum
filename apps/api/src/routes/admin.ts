import { Router } from "express";
import {
  adminCoursePatchSchema,
  adminUserPatchSchema,
  adminUserSchema,
  coursePayloadSchema,
  orderStatusSchema,
} from "@rozenblum/shared";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendData, notFound } from "../lib/http.js";
import { parsePagination } from "../lib/pagination.js";
import {
  createAdminUser,
  getAdminOrderEvents,
  deleteAdminUser,
  listAdminUsers,
  updateAdminOrder,
  updateAdminUser,
} from "../services/admin.js";
import { getAdminOverview, listAdminEnrollments } from "../services/dashboard.js";
import {
  createEmptyCourseForAdmin,
  deleteCourse,
  getCourseByRequestId,
  updateCourse,
} from "../services/courses.js";
import { listContacts } from "../services/contact.js";
import {
  asyncRoute,
  numericParam,
  parseBody,
  requestIdempotencyKey,
  requestRevision,
} from "./helpers.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get(
  "/overview",
  asyncRoute(async (_req, res) => {
    sendData(res, await getAdminOverview());
  }),
);

adminRouter.get(
  "/enrollments",
  asyncRoute(async (req, res) => {
    sendData(res, await listAdminEnrollments(parsePagination(req)));
  }),
);

adminRouter.get(
  "/contacts",
  asyncRoute(async (req, res) => {
    sendData(res, await listContacts(parsePagination(req)));
  }),
);

adminRouter.get(
  "/users",
  asyncRoute(async (req, res) => {
    const role = req.query.role;
    if (role !== "alumno" && role !== "profesor") {
      throw notFound("Especificá role=alumno o role=profesor.");
    }
    sendData(res, await listAdminUsers(role, parsePagination(req)));
  }),
);

adminRouter.post(
  "/users",
  asyncRoute(async (req, res) => {
    const input = parseBody(adminUserSchema, req.body);
    sendData(res, await createAdminUser(input), 201);
  }),
);

adminRouter.patch(
  "/users/:id",
  asyncRoute(async (req, res) => {
    const patch = parseBody(adminUserPatchSchema, req.body);
    sendData(res, await updateAdminUser(req.params.id, patch));
  }),
);

adminRouter.delete(
  "/users/:id",
  asyncRoute(async (req, res) => {
    await deleteAdminUser(req.params.id);
    res.status(204).end();
  }),
);

adminRouter.post(
  "/courses",
  asyncRoute(async (req, res) => {
    const input = parseBody(coursePayloadSchema, req.body);
    const course = await createEmptyCourseForAdmin(input, requestIdempotencyKey(req));
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
    await deleteCourse(courseId, { expectedRevision: requestRevision(req) });
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
