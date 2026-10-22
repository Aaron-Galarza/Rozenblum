import { Router } from "express";
import { loginSchema } from "@rozenblum/shared";
import { requireAuth } from "../middleware/auth.js";
import { sendData } from "../lib/http.js";
import { login } from "../services/auth.js";
import { userToDTO } from "../services/mappers.js";
import { asyncRoute, parseBody } from "./helpers.js";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncRoute(async (req, res) => {
    const input = parseBody(loginSchema, req.body);
    const session = await login(input);
    sendData(res, session);
  }),
);

authRouter.get(
  "/session",
  requireAuth,
  asyncRoute(async (req, res) => {
    sendData(res, userToDTO(req.authUser!));
  }),
);

/**
 * Sessions are stateless signed tokens, so logout is a client-side deletion.
 * The endpoint exists to make that contract explicit and to avoid 404 noise.
 */
authRouter.post("/logout", (_req, res) => {
  res.status(204).end();
});
