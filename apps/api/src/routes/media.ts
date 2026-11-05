import express, { Router } from "express";
import { z } from "zod";
import { badRequest, sendData } from "../lib/http.js";
import { createRateLimiter } from "../lib/rate-limit.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { assertMediaPermission, listImages, MAX_IMAGE_BYTES, MEDIA_CATEGORIES, uploadImage } from "../services/media.js";
import { asyncRoute } from "./helpers.js";

export const mediaRouter = Router();
mediaRouter.use(requireAuth, requireRole("profesor", "admin"));

const categorySchema = z.enum(MEDIA_CATEGORIES);
const galleryLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const uploadLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 20 });

mediaRouter.get("/:category", galleryLimiter, asyncRoute(async (req, res) => {
  const category = categorySchema.parse(req.params.category);
  assertMediaPermission(category, req.authUser!.role);
  const cursor = req.query.cursor === undefined
    ? undefined
    : z.string().min(1).max(2048).parse(req.query.cursor);
  sendData(res, await listImages(category, cursor));
}));

mediaRouter.post(
  "/:category",
  uploadLimiter,
  express.raw({ type: ["image/png", "image/jpeg", "image/webp", "image/avif"], limit: MAX_IMAGE_BYTES }),
  asyncRoute(async (req, res) => {
    const category = categorySchema.parse(req.params.category);
    assertMediaPermission(category, req.authUser!.role);
    if (!Buffer.isBuffer(req.body)) throw badRequest("Enviá un archivo de imagen válido.");
    sendData(res, await uploadImage(category, req.body), 201);
  }),
);
