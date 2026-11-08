import { BRAND_HERO_URL, type HomeContentDTO } from "@rozenblum/shared";
import { getRepositories } from "../repositories/index.js";
import type { Repositories } from "../repositories/interfaces.js";

const EMPTY_HOME: HomeContentDTO = {
  key: "home",
  brand: {
    locationLabel: "Resistencia, Chaco",
    foundedYear: "2004",
    heroImage: BRAND_HERO_URL,
    metrics: [],
    aboutParagraphs: [],
    footerTagline: "",
  },
  team: [],
  practiceAreas: [],
};

/**
 * Public home content. Team photos are resolved from the linked professor
 * accounts so the landing page always reflects the current profile image.
 */
export async function getHomeContent(): Promise<HomeContentDTO> {
  const repos = getRepositories();
  const content = await repos.home.get();
  return content ? toPublicHomeContent(content, repos) : EMPTY_HOME;
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
      heroImage: BRAND_HERO_URL,
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
