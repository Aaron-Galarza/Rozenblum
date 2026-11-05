import type { HomeContentDTO } from "@rozenblum/shared";
import { badRequest, notFound } from "../lib/http.js";
import { HomeContentModel, UserModel } from "../models/index.js";
import { assertManagedImageUrl } from "./media.js";

/**
 * Public home content. Team photos are resolved from the linked professor
 * accounts so the landing page always reflects the current profile image.
 */
export async function getHomeContent(): Promise<HomeContentDTO> {
  const content = await HomeContentModel.findOne({ key: "home" }).select("-_id").lean().exec();
  if (!content) throw notFound("El contenido de inicio no existe.");

  const userIds = (content.team ?? [])
    .map((member) => member.userId)
    .filter((id): id is string => Boolean(id));
  const users = await UserModel.find({ id: { $in: userIds }, role: "profesor" })
    .select({ id: 1, img: 1 })
    .lean<{ id: string; img?: string }[]>()
    .exec();
  const byId = new Map(users.map((user) => [user.id, user.img]));

  return {
    ...content,
    key: "home",
    team: (content.team ?? []).map((member) => ({
      ...member,
      img: byId.get(member.userId ?? "") || member.img,
    })),
  };
}

export async function updateHomeHeroImage(heroImage: string): Promise<HomeContentDTO> {
  assertManagedImageUrl(heroImage, "brand");
  const current = await HomeContentModel.findOne({ key: "home" }).lean().exec();
  if (!current) throw notFound("El contenido de inicio no existe.");
  const updated = await HomeContentModel.findOneAndUpdate(
    { key: "home", "brand.heroImage": current.brand.heroImage },
    { $set: { "brand.heroImage": heroImage } },
    { returnDocument: "after" },
  ).select("-_id").lean().exec();
  if (!updated) throw badRequest("El contenido cambió. Recargá la página e intentá nuevamente.");
  return updated;
}
