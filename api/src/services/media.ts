import { createHash, randomUUID } from "node:crypto";
import { ApiError, badRequest, forbidden } from "../lib/http.js";
import { env } from "../config/env.js";

export const MEDIA_CATEGORIES = ["courses", "professors", "lessons"] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];
export const MEDIA_ROOT = "Rozenblum";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type CloudinaryAsset = {
  asset_id: string;
  public_id: string;
  secure_url: string;
  asset_folder?: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  created_at?: string;
  resource_type?: string;
};

export type GalleryImage = {
  id: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  createdAt: string;
};

export function mediaFolder(category: MediaCategory) {
  return `${MEDIA_ROOT}/${category}`;
}

export function isManagedImageUrl(value: string, category: MediaCategory, cloud = env.CLOUDINARY_CLOUD_NAME): boolean {
  if (!cloud) return false;
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/");
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" &&
      parts[1] === cloud && parts[2] === "image" && parts[3] === "upload" &&
      /^v\d+$/.test(parts[4] ?? "") && parts[5] === MEDIA_ROOT &&
      parts[6] === category && /^[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp|avif)$/i.test(parts[7] ?? "") &&
      parts.length === 8 && !url.search && !url.hash;
  } catch { return false; }
}

export function assertManagedImageUrl(value: string, category: MediaCategory) {
  if (!isManagedImageUrl(value, category)) {
    throw badRequest(`Seleccioná una imagen de la carpeta ${mediaFolder(category)} en Cloudinary.`);
  }
}

export function detectImageFormat(bytes: Buffer): "png" | "jpeg" | "webp" | "avif" | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 12) === "ftypavif") return "avif";
  return null;
}

function config() {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = env;
  if (!cloud || !key || !secret) throw new ApiError(503, "MEDIA_UNAVAILABLE", "La galería de imágenes no está configurada.");
  return { cloud, key, secret };
}

function cloudinaryUrl(path: string) {
  const { cloud } = config();
  return `https://api.cloudinary.com/v1_1/${cloud}/${path}`;
}

function basicAuth() {
  const { key, secret } = config();
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

function publicImage(asset: CloudinaryAsset, folder: string): GalleryImage | null {
  const { cloud } = config();
  let url: URL;
  try { url = new URL(asset.secure_url); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" ||
      !url.pathname.startsWith(`/${cloud}/image/upload/`) || asset.asset_folder !== folder ||
      asset.resource_type !== "image") return null;
  const thumbnailUrl = asset.secure_url.replace("/image/upload/", "/image/upload/c_fill,g_auto,w_320,h_220,f_auto,q_auto/");
  return {
    id: asset.asset_id,
    url: asset.secure_url,
    thumbnailUrl,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    bytes: asset.bytes ?? 0,
    format: asset.format ?? "",
    createdAt: asset.created_at ?? "",
  };
}

export async function listImages(category: MediaCategory, cursor?: string) {
  const folder = mediaFolder(category);
  const query = new URLSearchParams({ asset_folder: folder, max_results: "48", direction: "desc" });
  if (cursor) query.set("next_cursor", cursor);
  let response: Response;
  try {
    response = await fetch(`${cloudinaryUrl("resources/by_asset_folder")}?${query}`, {
      headers: { Authorization: basicAuth() }, signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new ApiError(502, "MEDIA_UPSTREAM_ERROR", "No se pudo consultar la galería de imágenes.");
  }
  if (response.status === 404) return { images: [], nextCursor: null };
  if (!response.ok) throw new ApiError(502, "MEDIA_UPSTREAM_ERROR", "No se pudo consultar la galería de imágenes.");
  const payload = await response.json() as { resources?: CloudinaryAsset[]; next_cursor?: string };
  return {
    images: (payload.resources ?? []).map((asset) => publicImage(asset, folder)).filter((asset): asset is GalleryImage => asset !== null),
    nextCursor: payload.next_cursor ?? null,
  };
}

export async function uploadImage(category: MediaCategory, bytes: Buffer) {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw badRequest("La imagen debe pesar entre 1 byte y 8 MB.");
  const format = detectImageFormat(bytes);
  if (!format) throw badRequest("Solo se permiten imágenes PNG, JPEG, WebP o AVIF válidas.");

  const folder = mediaFolder(category);
  const { key, secret } = config();
  const params = {
    asset_folder: folder,
    public_id: randomUUID(),
    timestamp: String(Math.floor(Date.now() / 1000)),
    use_asset_folder_as_public_id_prefix: "true",
  };
  const signature = createHash("sha1")
    .update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join("&") + secret)
    .digest("hex");
  const body = new FormData();
  for (const [name, value] of Object.entries(params)) body.set(name, value);
  body.set("api_key", key);
  body.set("signature", signature);
  body.set("file", new Blob([new Uint8Array(bytes)], { type: `image/${format}` }), `image.${format}`);

  let response: Response;
  try {
    response = await fetch(cloudinaryUrl("image/upload"), {
      method: "POST", body, signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new ApiError(502, "MEDIA_UPSTREAM_ERROR", "No se pudo subir la imagen. Intentá nuevamente.");
  }
  if (!response.ok) throw new ApiError(502, "MEDIA_UPSTREAM_ERROR", "No se pudo subir la imagen. Intentá nuevamente.");
  const asset = await response.json() as CloudinaryAsset;
  const image = publicImage(asset, folder);
  if (!image) throw new ApiError(502, "MEDIA_UPSTREAM_ERROR", "Cloudinary devolvió una imagen inesperada.");
  return image;
}

export function assertMediaPermission(category: MediaCategory, role: string) {
  if (role !== "admin" && category !== "courses" && category !== "lessons") {
    throw forbidden("Solo un administrador puede gestionar estas imágenes.");
  }
}
