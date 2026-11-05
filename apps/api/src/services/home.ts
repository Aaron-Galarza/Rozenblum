import type { HomeContentDTO } from "@rozenblum/shared";
import { badRequest, notFound } from "../lib/http.js";
import { getRepositories } from "../repositories/index.js";
import type { Repositories } from "../repositories/interfaces.js";
import { assertManagedImageUrl } from "./media.js";

/**
 * Public home content. Team photos are resolved from the linked professor
 * accounts so the landing page always reflects the current profile image.
 */
export async function getHomeContent(): Promise<HomeContentDTO> {
  const repos = getRepositories();
  const content = await repos.home.get();
  if (!content) throw notFound("El contenido de inicio no existe.");
  return toPublicHomeContent(content, repos);
}

async function toPublicHomeContent(content: HomeContentDTO, repos: Repositories): Promise<HomeContentDTO> {
  const userIds = [...new Set(content.team.flatMap((member) => member.userId ? [member.userId] : []))];
  const professorImages = await repos.users.findProfessorImagesByIds(userIds);
  const imagesById = new Map(professorImages.map(({ id, img }) => [id, img]));
  const team = content.team.map((member) => {
    return {
      name: member.name,
      role: member.role,
      img: imagesById.get(member.userId ?? "") || member.img,
    };
  });

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
  const repos = getRepositories();
  assertManagedImageUrl(heroImage, "brand");
  const current = await repos.home.get();
  if (!current) throw notFound("El contenido de inicio no existe.");
  const updated = await repos.home.updateHeroImage(current.brand.heroImage, heroImage);
  if (!updated) throw badRequest("El contenido cambió. Recargá la página e intentá nuevamente.");
  return toPublicHomeContent(updated, repos);
}
