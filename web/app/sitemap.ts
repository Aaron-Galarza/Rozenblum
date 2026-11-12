import type { MetadataRoute } from "next";
import type { CourseDTO } from "@rozenblum/shared";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) return [];

  let base: URL;
  try {
    base = new URL(site);
    if (base.protocol !== "https:" && base.protocol !== "http:") return [];
  } catch {
    return [];
  }

  const pages: MetadataRoute.Sitemap = ["/", "/catalogo"].map((path) => ({ url: new URL(path, base).toString() }));
  try {
    const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    const response = await fetch(`${api}/api/courses`, { cache: "no-store" });
    if (!response.ok) return pages;
    const payload = await response.json() as { data?: CourseDTO[] };
    for (const course of payload.data ?? []) {
      if (course.status === "published" && course.slug) {
        pages.push({ url: new URL(`/cursos/${encodeURIComponent(course.slug)}`, base).toString() });
      }
    }
  } catch {
    // Keep the static public URLs available when the API is temporarily unavailable.
  }
  return pages;
}
