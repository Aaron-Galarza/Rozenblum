import { ApiError, badRequest } from "../lib/http.js";

export type YouTubePreview = { videoId: string; title: string; channel: string };

const cache = new Map<string, { value: YouTubePreview; expiresAt: number }>();

export function parseYouTubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === "youtu.be" || host === "www.youtu.be") id = url.pathname.slice(1);
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
      id = url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/")
        ? url.pathname.split("/")[2]
        : url.searchParams.get("v");
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function getYouTubePreview(url: string): Promise<YouTubePreview> {
  const videoId = parseYouTubeId(url);
  if (!videoId) throw badRequest("Ingresá una URL de YouTube válida.");
  const cached = cache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const canonical = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`;
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(4000) });
    if (!response.ok || Number(response.headers.get("content-length") || 0) > 16_384) {
      throw new Error("YouTube oEmbed unavailable");
    }
    const raw = await response.text();
    if (raw.length > 16_384) throw new Error("YouTube oEmbed response too large");
    const data = JSON.parse(raw) as { title?: unknown; author_name?: unknown };
    if (typeof data.title !== "string" || !data.title.trim() || typeof data.author_name !== "string") {
      throw new Error("YouTube oEmbed response invalid");
    }
    const value = { videoId, title: data.title.trim().slice(0, 180), channel: data.author_name.trim().slice(0, 120) };
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(videoId, { value, expiresAt: Date.now() + 6 * 60 * 60_000 });
    return value;
  } catch {
    throw new ApiError(502, "VIDEO_PREVIEW_UNAVAILABLE", "No se pudo obtener el título del video. Verificá que sea accesible e intentá nuevamente.");
  }
}
