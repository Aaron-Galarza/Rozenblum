import { Router } from "express";
import { changePasswordSchema, loginSchema } from "@rozenblum/shared";
import { requireAuth } from "../middleware/auth.js";
import { sendData } from "../lib/http.js";
import { changeOwnPassword, login } from "../services/auth.js";
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
 * Self-service password change (all roles). The response is a new session:
 * the password change revokes every token issued before it, including the one
 * used for this request.
 */
authRouter.post(
  "/password",
  requireAuth,
  asyncRoute(async (req, res) => {
    const input = parseBody(changePasswordSchema, req.body);
    sendData(res, await changeOwnPassword(req.authUser!, input));
  }),
);

/**
 * Sessions are stateless signed tokens, so logout is a client-side deletion.
 * The endpoint exists to make that contract explicit and to avoid 404 noise.
 */
authRouter.post("/logout", (_req, res) => {
  res.status(204).end();
});
