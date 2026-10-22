import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ApiError, sendData } from "../lib/http.js";
import { asyncRoute } from "./helpers.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const media = () => {
  const db = mongoose.connection.db;
  if (!db) throw new ApiError(503, "DATABASE_UNAVAILABLE", "La base de datos no está disponible.");
  return db.collection<{ _id: string; bytes: mongoose.mongo.Binary; mime: string; createdAt: Date }>("lesson_media");
};

export function imageMime(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export const mediaRouter = Router();

mediaRouter.post(
  "/images",
  requireAuth,
  requireRole("profesor", "admin"),
  express.raw({ type: ["image/png", "image/jpeg", "image/gif", "image/webp"], limit: MAX_IMAGE_BYTES }),
  asyncRoute(async (req, res) => {
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      throw new ApiError(400, "INVALID_IMAGE", "La imagen debe ser PNG, JPEG, GIF o WebP y pesar hasta 5 MB.");
    }
    const mime = imageMime(bytes);
    if (!mime || req.headers["content-type"]?.split(";")[0] !== mime) {
      throw new ApiError(400, "INVALID_IMAGE", "El contenido del archivo no coincide con el tipo de imagen.");
    }
    const id = randomUUID();
    await media().insertOne({ _id: id, bytes: new mongoose.mongo.Binary(bytes), mime, createdAt: new Date() });
    sendData(res, { id }, 201);
  }),
);

mediaRouter.get(
  "/images/:id",
  asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new ApiError(404, "NOT_FOUND", "Imagen no encontrada.");
    }
    const image = await media().findOne({ _id: id });
    if (!image) throw new ApiError(404, "NOT_FOUND", "Imagen no encontrada.");
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    res.type(image.mime).send(Buffer.from(image.bytes.value()));
  }),
);
