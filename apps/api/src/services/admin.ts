import type { SiteSettingsDTO } from "@rozenblum/shared";
import { conflict, notFound, badRequest } from "../lib/http.js";
import { hashPassword } from "../lib/password.js";
import { initialsFromName } from "../lib/utils.js";
import { env } from "../config/env.js";
import type { Pagination } from "../lib/pagination.js";
import { getRepositories } from "../repositories/index.js";
import { settingsToDTO, userToDTO } from "./mappers.js";
import type { UserDTO } from "@rozenblum/shared";
import { assertManagedImageUrl } from "./media.js";
import { applyOrderTransition } from "./order-transitions.js";
import type { StoredUser } from "../types.js";

export async function createAdminUser(input: {
  /**
   * Students are created only when an approved checkout is paid. Professors
   * are the sole manual exception because they have no checkout flow yet.
   */
  role: "profesor";
  name: string;
  email: string;
  password: string;
  img?: string;
}): Promise<UserDTO> {
  const repos = getRepositories();
  if (input.img) assertManagedImageUrl(input.img, "professors");
  const existing = await repos.users.findByEmail(input.email);
  if (existing) throw conflict("Ya existe una cuenta con ese correo.");

  const user = await repos.users.create({
    name: input.name,
    email: input.email,
    role: input.role,
    passwordHash: await hashPassword(input.password),
    initials: initialsFromName(input.name),
    img: input.img,
    sessionVersion: 0,
  });
  return userToDTO(user);
}

export async function updateAdminUser(
  id: string,
  patch: { name?: string; email?: string; status?: "Activo" | "Suspendido"; password?: string; img?: string },
): Promise<UserDTO> {
  const repos = getRepositories();
  if (patch.img) assertManagedImageUrl(patch.img, "professors");
  const user = await repos.users.findById(id);
  if (!user) throw notFound("Usuario no encontrado.");
  if (user.role === "admin") throw badRequest("La cuenta administradora no se edita desde este panel.");

  if (patch.email && patch.email.toLowerCase() !== user.email.toLowerCase()) {
    throw badRequest("El correo de una cuenta existente no se puede cambiar porque identifica sus cursos, órdenes y conversaciones.");
  }

  const { password, ...safePatch } = patch;
  // Suspending, reactivating or changing a password invalidates every token
  // issued before this update.
  const mustRevoke = Boolean(patch.status && patch.status !== user.status) || Boolean(password);
  const updated = await repos.users.update(id, {
    ...safePatch,
    ...(password ? { passwordHash: await hashPassword(password) } : {}),
    initials: patch.name ? initialsFromName(patch.name) : undefined,
  }, { revokeSessions: mustRevoke });
  if (!updated) throw notFound("Usuario no encontrado.");
  return userToDTO(updated);
}

export async function deleteAdminUser(id: string): Promise<void> {
  const repos = getRepositories();
  const user = await repos.users.findById(id);
  if (!user) throw notFound("Usuario no encontrado.");
  if (user.role === "admin") throw badRequest("No se puede eliminar la cuenta administradora.");

  if (user.role === "profesor" &&
      (await repos.courses.list()).some((course) => course.professorEmail?.toLowerCase() === user.email.toLowerCase())) {
    throw badRequest("Reasigná los cursos del profesor antes de eliminar su cuenta.");
  }

  if (user.role === "alumno") {
    await repos.enrollments.deleteByStudent(user.email);
    // Conversations contain the student's messages; do not leave them behind
    // where a later account with the same email could read them.
    await repos.conversations.deleteByStudent(user.email);
  }
  await repos.users.delete(id);
}

export async function updateAdminOrder(
  id: string,
  estado: "Pagado" | "Pendiente" | "Rechazado" | "Reembolsado",
  motivo: string,
  actor: StoredUser,
): Promise<void> {
  await applyOrderTransition({ reference: id, status: estado, source: "manual",
    reason: motivo, actorId: actor.id });
}

export async function getAdminOrderEvents(id: string) {
  const repos = getRepositories();
  const order = await repos.orders.findByReference(id);
  if (!order) throw notFound("Orden no encontrada.");
  return repos.paymentEvents.listByOrder(order.id);
}

export async function updateSettings(input: {
  companyName: string;
  supportEmail: string;
  contactWhatsapp: string;
  logoUrl: string;
  privacyText: string;
}): Promise<SiteSettingsDTO> {
  if (input.logoUrl) assertManagedImageUrl(input.logoUrl, "brand");
  const settings = await getRepositories().settings.update(input);
  return settingsToDTO(settings, env.paymentsConfigured);
}

export async function listAdminUsers(
  role: "alumno" | "profesor",
  page?: Pagination,
): Promise<UserDTO[]> {
  const users = await getRepositories().users.list(role, page);
  return users.map(userToDTO);
}
