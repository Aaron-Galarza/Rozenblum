import type { HomeContentDTO } from "@rozenblum/shared";
import { badRequest, notFound } from "../lib/http.js";
import { getRepositories } from "../repositories/index.js";
import { assertManagedImageUrl } from "./media.js";

/**
 * Public home content. Team photos are resolved from the linked professor
 * accounts so the landing page always reflects the current profile image.
 */
export async function getHomeContent(): Promise<HomeContentDTO> {
  const repos = getRepositories();
  const content = await repos.home.get();
  if (!content) throw notFound("El contenido de inicio no existe.");
  const team = await Promise.all((content.team ?? []).map(async (member) => {
    const user = member.userId ? await repos.users.findById(member.userId) : null;
    return {
      name: member.name,
      role: member.role,
      img: user?.role === "profesor" && user.img ? user.img : member.img,
    };
  }));

  return {
    key: "home",
    brand: {
      locationLabel: content.brand.locationLabel,
      foundedYear: content.brand.foundedYear,
      heroImage: content.brand.heroImage,
      metrics: content.brand.metrics.map(({ value, label }) => ({ value, label })),
      aboutParagraphs: [...content.brand.aboutParagraphs],
      footerTagline: content.brand.footerTagline,
    },
    team,
    practiceAreas: content.practiceAreas.map((area) => ({
      title: area.title,
      desc: area.desc,
      icon: area.icon,
      casos: area.casos.map(({ q, a }) => ({ q, a })),
    })),
  };
}

export async function updateHomeHeroImage(heroImage: string): Promise<HomeContentDTO> {
  assertManagedImageUrl(heroImage, "brand");
  const current = await getRepositories().home.get();
  if (!current) throw notFound("El contenido de inicio no existe.");
  const updated = await getRepositories().home.updateHeroImage(current.brand.heroImage, heroImage);
  if (!updated) throw badRequest("El contenido cambió. Recargá la página e intentá nuevamente.");
  return getHomeContent();
}
