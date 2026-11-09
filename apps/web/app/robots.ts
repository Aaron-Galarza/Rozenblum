import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  let sitemap: string | undefined;
  try {
    if (site) sitemap = new URL("/sitemap.xml", site).toString();
  } catch {
    // Domain configuration is intentionally pending until confirmed.
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/alumno", "/profesor", "/login", "/confirmacion"] }],
    ...(sitemap ? { sitemap } : {}),
  };
}
