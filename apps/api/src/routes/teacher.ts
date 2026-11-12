import { Router, type Response } from "express";
import {
  adminCoursePatchSchema,
  lessonPayloadSchema,
  messagePayloadSchema,
  reorderSchema,
} from "@rozenblum/shared";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendData, sendPaginated } from "../lib/http.js";
import { parseMessagePagination } from "../lib/pagination.js";
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
  type ModuleMutationResult,
} from "../services/courses.js";
import {
  getConversationForTeacher,
  listTeacherStudentMessages,
  listTeacherConversations,
  sendTeacherMessage,
  sendTeacherStudentMessage,
} from "../services/chat.js";
import {
  asyncRoute,
  numericParam,
  parseBody,
  requestIdempotencyKey,
  requestRevision,
} from "./helpers.js";
import { getYouTubePreview } from "../services/youtube.js";

export const teacherRouter = Router();

/** Sends the module list plus the revision it produced (headers only). */
function sendModules(res: Response, result: ModuleMutationResult, status = 200) {
  res.setHeader("ETag", `"${result.revision}"`);
  res.setHeader("X-Course-Revision", String(result.revision));
  sendData(res, result.modules, status);
}

teacherRouter.use(requireAuth, requireRole("profesor", "admin"));

teacherRouter.get("/youtube-preview", asyncRoute(async (req, res) => {
  const url = z.string().url().max(2048).parse(req.query.url);
  sendData(res, await getYouTubePreview(url));
}));

const moduleTitleSchema = z.object({
  title: z.string().trim().min(1).max(180),
});
const teacherCoursePatchSchema = adminCoursePatchSchema.pick({
  title: true,
  description: true,
  status: true,
  img: true,
}).strict();

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
    const patch = parseBody(teacherCoursePatchSchema, req.body);
    const updated = await updateCourse(courseId, patch, req.authUser!, {
      expectedRevision: requestRevision(req),
    });
    res.setHeader("ETag", `"${updated.revision ?? 0}"`);
    sendData(res, updated);
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
  "/courses/:courseId/students/:enrollmentId/messages",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const page = parseMessagePagination(req);
    const { messages, total } = await listTeacherStudentMessages(
      req.authUser!,
      courseId,
      req.params.enrollmentId,
      page,
    );
    sendPaginated(res, messages, total, page);
  }),
);

teacherRouter.post(
  "/courses/:courseId/students/:enrollmentId/messages",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const input = parseBody(messagePayloadSchema, req.body);
    sendData(res, await sendTeacherStudentMessage(req.authUser!, courseId, req.params.enrollmentId, input.text), 201);
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
    sendModules(
      res,
      await addModule(courseId, input.title, req.authUser!, {
        expectedRevision: requestRevision(req),
        requestId: requestIdempotencyKey(req),
      }),
      201,
    );
  }),
);

teacherRouter.patch(
  "/courses/:courseId/modules/:moduleId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const moduleId = numericParam(req.params.moduleId, "Módulo");
    const input = parseBody(moduleTitleSchema, req.body);
    sendModules(
      res,
      await updateModule(courseId, moduleId, input, req.authUser!, {
        expectedRevision: requestRevision(req),
      }),
    );
  }),
);

teacherRouter.delete(
  "/courses/:courseId/modules/:moduleId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const moduleId = numericParam(req.params.moduleId, "Módulo");
    sendModules(
      res,
      await deleteModule(courseId, moduleId, req.authUser!, {
        expectedRevision: requestRevision(req),
      }),
    );
  }),
);

teacherRouter.put(
  "/courses/:courseId/modules/reorder",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const input = parseBody(reorderSchema, req.body);
    const ids = input.ids.map((id) => Number(id));
    sendModules(
      res,
      await reorderModules(courseId, ids, req.authUser!, {
        expectedRevision: requestRevision(req),
      }),
    );
  }),
);

teacherRouter.post(
  "/courses/:courseId/modules/:moduleId/lessons",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const moduleId = numericParam(req.params.moduleId, "Módulo");
    const input = parseBody(lessonPayloadSchema, req.body);
    sendModules(
      res,
      await addLesson(courseId, moduleId, input, req.authUser!, {
        expectedRevision: requestRevision(req),
        requestId: requestIdempotencyKey(req),
      }),
      201,
    );
  }),
);

teacherRouter.patch(
  "/courses/:courseId/modules/:moduleId/lessons/:lessonId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const moduleId = numericParam(req.params.moduleId, "Módulo");
    const input = parseBody(lessonPayloadSchema.partial(), req.body);
    sendModules(
      res,
      await updateLesson(courseId, moduleId, req.params.lessonId, input, req.authUser!, {
        expectedRevision: requestRevision(req),
      }),
    );
  }),
);

teacherRouter.delete(
  "/courses/:courseId/modules/:moduleId/lessons/:lessonId",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const moduleId = numericParam(req.params.moduleId, "Módulo");
    sendModules(
      res,
      await deleteLesson(courseId, moduleId, req.params.lessonId, req.authUser!, {
        expectedRevision: requestRevision(req),
      }),
    );
  }),
);

teacherRouter.put(
  "/courses/:courseId/modules/:moduleId/lessons/reorder",
  asyncRoute(async (req, res) => {
    const courseId = numericParam(req.params.courseId, "Curso");
    const moduleId = numericParam(req.params.moduleId, "Módulo");
    const input = parseBody(reorderSchema, req.body);
    sendModules(
      res,
      await reorderLessons(courseId, moduleId, input.ids.map(String), req.authUser!, {
        expectedRevision: requestRevision(req),
      }),
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
    const page = parseMessagePagination(req);
    const { conversation, total } = await getConversationForTeacher(
      req.authUser!,
      req.params.id,
      page,
    );
    res.setHeader("X-Total-Count", String(total));
    sendData(res, conversation);
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
