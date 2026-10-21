import { Router } from "express";
import { messagePayloadSchema, progressSchema } from "@rozenblum/shared";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendData } from "../lib/http.js";
import {
  getStudentEnrollment,
  listStudentEnrollments,
  listStudentMessages,
  sendStudentMessage,
  setLessonProgress,
} from "../services/classroom.js";
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
    sendData(res, await listStudentMessages(req.authUser!, req.params.id));
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
