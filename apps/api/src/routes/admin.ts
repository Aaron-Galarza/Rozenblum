import { Router } from "express";
import {
  adminCoursePatchSchema,
  adminUserPatchSchema,
  adminUserSchema,
  coursePayloadSchema,
  orderStatusSchema,
  siteSettingsSchema,
} from "@rozenblum/shared";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendData, notFound } from "../lib/http.js";
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminOrder,
  updateAdminUser,
  updateSettings,
} from "../services/admin.js";
import { getAdminOverview, listAdminEnrollments } from "../services/dashboard.js";
import { createEmptyCourseForAdmin, deleteCourse, updateCourse } from "../services/courses.js";
import { listContacts } from "../services/contact.js";
import { asyncRoute, numericParam, parseBody } from "./helpers.js";

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
  asyncRoute(async (_req, res) => {
    sendData(res, await listAdminEnrollments());
  }),
);

adminRouter.get(
  "/contacts",
  asyncRoute(async (_req, res) => {
    sendData(res, await listContacts());
  }),
);

adminRouter.get(
  "/users",
  asyncRoute(async (req, res) => {
    const role = req.query.role;
    if (role !== "alumno" && role !== "profesor") {
      throw notFound("Especificá role=alumno o role=profesor.");
    }
    sendData(res, await listAdminUsers(role));
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
    sendData(res, await createEmptyCourseForAdmin(input), 201);
  }),
);

adminRouter.patch(
  "/courses/:courseId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const patch = parseBody(adminCoursePatchSchema, req.body);
    sendData(res, await updateCourse(courseId, patch, req.authUser!));
  }),
);

adminRouter.delete(
  "/courses/:courseId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    await deleteCourse(courseId);
    res.status(204).end();
  }),
);

adminRouter.patch(
  "/orders/:id",
  asyncRoute(async (req, res) => {
    const input = parseBody(orderStatusSchema, req.body);
    await updateAdminOrder(req.params.id, input.estado);
    sendData(res, { id: req.params.id, estado: input.estado });
  }),
);

adminRouter.put(
  "/settings",
  asyncRoute(async (req, res) => {
    const input = parseBody(siteSettingsSchema, req.body);
    sendData(res, await updateSettings(input));
  }),
);
