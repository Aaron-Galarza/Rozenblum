import { Router } from "express";
import { messagePayloadSchema, progressSchema } from "@rozenblum/shared";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendData, sendPaginated } from "../lib/http.js";
import { parseMessagePagination } from "../lib/pagination.js";
import {
  getStudentEnrollment,
  listStudentEnrollments,
  setLessonProgress,
} from "../services/classroom.js";
import { listStudentMessages, sendStudentMessage } from "../services/chat.js";
import { asyncRoute, parseBody } from "./helpers.js";

export const studentRouter = Router();

studentRouter.use(requireAuth, requireRole("alumno"));

studentRouter.get(
  "/enrollments",
  asyncRoute(async (req, res) => {
    sendData(res, await listStudentEnrollments(req.authUser!));
  }),
);

studentRouter.get(
  "/enrollments/:id",
  asyncRoute(async (req, res) => {
    sendData(res, await getStudentEnrollment(req.authUser!, req.params.id));
  }),
);

studentRouter.patch(
  "/enrollments/:id/progress",
  asyncRoute(async (req, res) => {
    const input = parseBody(progressSchema, req.body);
    const enrollment = await setLessonProgress(
      req.authUser!,
      req.params.id,
      input.lessonId,
      input.completed,
    );
    sendData(res, enrollment);
  }),
);

studentRouter.get(
  "/enrollments/:id/messages",
  asyncRoute(async (req, res) => {
    const page = parseMessagePagination(req);
    const { messages, total } = await listStudentMessages(
      req.authUser!,
      req.params.id,
      page,
    );
    sendPaginated(res, messages, total, page);
  }),
);

studentRouter.post(
  "/enrollments/:id/messages",
  asyncRoute(async (req, res) => {
    const input = parseBody(messagePayloadSchema, req.body);
    const messages = await sendStudentMessage(req.authUser!, req.params.id, input.text);
    sendData(res, messages, 201);
  }),
);
