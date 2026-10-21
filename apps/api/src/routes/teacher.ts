import { Router } from "express";
import {
  adminCoursePatchSchema,
  lessonPayloadSchema,
  messagePayloadSchema,
  reorderSchema,
} from "@rozenblum/shared";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendData } from "../lib/http.js";
import { getTeacherDashboard, getTeacherStudents } from "../services/dashboard.js";
import {
  addLesson,
  addModule,
  deleteLesson,
  deleteModule,
  getCourseStructureForTeacher,
  getTeacherCourseList,
  listCourseEnrollments,
  reorderLessons,
  reorderModules,
  updateCourse,
  updateLesson,
  updateModule,
} from "../services/courses.js";
import {
  getConversationForTeacher,
  listTeacherConversations,
  sendTeacherMessage,
} from "../services/classroom.js";
import { asyncRoute, numericParam, parseBody } from "./helpers.js";

export const teacherRouter = Router();

teacherRouter.use(requireAuth, requireRole("profesor", "admin"));

const moduleTitleSchema = z.object({
  title: z.string().trim().min(1).max(180),
});

teacherRouter.get(
  "/dashboard",
  asyncRoute(async (req, res) => {
    sendData(res, await getTeacherDashboard(req.authUser!));
  }),
);

teacherRouter.get(
  "/courses",
  asyncRoute(async (req, res) => {
    sendData(res, await getTeacherCourseList(req.authUser!));
  }),
);

teacherRouter.get(
  "/courses/:courseId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    sendData(res, await getCourseStructureForTeacher(courseId, req.authUser!));
  }),
);

teacherRouter.patch(
  "/courses/:courseId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const patch = parseBody(adminCoursePatchSchema, req.body);
    sendData(res, await updateCourse(courseId, patch, req.authUser!));
  }),
);

teacherRouter.get(
  "/courses/:courseId/students",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    sendData(res, await getTeacherStudents(req.authUser!, courseId));
  }),
);

teacherRouter.get(
  "/courses/:courseId/enrollments",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    sendData(res, await listCourseEnrollments(courseId, req.authUser!));
  }),
);

teacherRouter.post(
  "/courses/:courseId/modules",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const input = parseBody(moduleTitleSchema, req.body);
    sendData(res, await addModule(courseId, input.title, req.authUser!), 201);
  }),
);

teacherRouter.patch(
  "/courses/:courseId/modules/:moduleId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const moduleId = numericParam(req.params.moduleId, "Módulo");
    const input = parseBody(moduleTitleSchema, req.body);
    sendData(res, await updateModule(courseId, moduleId, input, req.authUser!));
  }),
);

teacherRouter.delete(
  "/courses/:courseId/modules/:moduleId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const moduleId = numericParam(req.params.moduleId, "Módulo");
    sendData(res, await deleteModule(courseId, moduleId, req.authUser!));
  }),
);

teacherRouter.put(
  "/courses/:courseId/modules/reorder",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const input = parseBody(reorderSchema, req.body);
    const ids = input.ids.map((id) => Number(id));
    sendData(res, await reorderModules(courseId, ids, req.authUser!));
  }),
);

teacherRouter.post(
  "/courses/:courseId/modules/:moduleId/lessons",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const moduleId = numericParam(req.params.moduleId, "Módulo");
    const input = parseBody(lessonPayloadSchema, req.body);
    sendData(res, await addLesson(courseId, moduleId, input, req.authUser!), 201);
  }),
);

teacherRouter.patch(
  "/courses/:courseId/modules/:moduleId/lessons/:lessonId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const moduleId = numericParam(req.params.moduleId, "Módulo");
    const input = parseBody(lessonPayloadSchema.partial(), req.body);
    sendData(
      res,
      await updateLesson(courseId, moduleId, req.params.lessonId, input, req.authUser!),
    );
  }),
);

teacherRouter.delete(
  "/courses/:courseId/modules/:moduleId/lessons/:lessonId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const moduleId = numericParam(req.params.moduleId, "Módulo");
    sendData(res, await deleteLesson(courseId, moduleId, req.params.lessonId, req.authUser!));
  }),
);

teacherRouter.put(
  "/courses/:courseId/modules/:moduleId/lessons/reorder",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const moduleId = numericParam(req.params.moduleId, "Módulo");
    const input = parseBody(reorderSchema, req.body);
    sendData(
      res,
      await reorderLessons(courseId, moduleId, input.ids.map(String), req.authUser!),
    );
  }),
);

teacherRouter.get(
  "/conversations",
  asyncRoute(async (req, res) => {
    sendData(res, await listTeacherConversations(req.authUser!));
  }),
);

teacherRouter.get(
  "/conversations/:id",
  asyncRoute(async (req, res) => {
    sendData(res, await getConversationForTeacher(req.authUser!, req.params.id));
  }),
);

teacherRouter.post(
  "/conversations/:id/messages",
  asyncRoute(async (req, res) => {
    const input = parseBody(messagePayloadSchema, req.body);
    const messages = await sendTeacherMessage(req.authUser!, req.params.id, input.text);
    sendData(res, messages, 201);
  }),
);
