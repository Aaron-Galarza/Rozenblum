import type { SiteSettingsDTO } from "@rozenblum/shared";
import { conflict, notFound, badRequest } from "../lib/http.js";
import { hashPassword } from "../lib/password.js";
import { initialsFromName } from "../lib/utils.js";
import { env } from "../config/env.js";
import type { Pagination } from "../lib/pagination.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredUser } from "../types.js";
import { settingsToDTO, userToDTO } from "./mappers.js";
import type { UserDTO } from "@rozenblum/shared";

export async function createAdminUser(input: {
  role: "alumno" | "profesor";
  name: string;
  email: string;
}): Promise<UserDTO> {
  const repos = getRepositories();
  const existing = await repos.users.findByEmail(input.email);
  if (existing) throw conflict("Ya existe una cuenta con ese correo.");

  const user = await repos.users.create({
    name: input.name,
    email: input.email,
    role: input.role,
    passwordHash: hashPassword(env.DEMO_PASSWORD),
    initials: initialsFromName(input.name),
  });
  return userToDTO(user);
}

export async function updateAdminUser(
  id: string,
  patch: { name?: string; email?: string; status?: "Activo" | "Suspendido" },
): Promise<UserDTO> {
  const repos = getRepositories();
  const user = await repos.users.findById(id);
  if (!user) throw notFound("Usuario no encontrado.");
  if (user.role === "admin") throw badRequest("La cuenta administradora no se edita desde este panel.");

  if (patch.email && patch.email.toLowerCase() !== user.email.toLowerCase()) {
    const existing = await repos.users.findByEmail(patch.email);
    if (existing) throw conflict("Ese correo ya está en uso.");
  }

  const updated = await repos.users.update(id, {
    ...patch,
    initials: patch.name ? initialsFromName(patch.name) : undefined,
  });
  if (!updated) throw notFound("Usuario no encontrado.");
  return userToDTO(updated);
}

export async function deleteAdminUser(id: string): Promise<void> {
  const repos = getRepositories();
  const user = await repos.users.findById(id);
  if (!user) throw notFound("Usuario no encontrado.");
  if (user.role === "admin") throw badRequest("No se puede eliminar la cuenta administradora.");

  if (user.role === "alumno") {
    await repos.enrollments.deleteByStudent(user.email);
  }
  await repos.users.delete(id);
}

export async function updateAdminOrder(
  id: string,
  estado: "Pagado" | "Pendiente" | "Rechazado" | "Reembolsado",
): Promise<void> {
  const repos = getRepositories();
  const order = await repos.orders.updateStatus(id, estado);
  if (!order) throw notFound("Orden no encontrada.");

  if (estado === "Pagado") {
    const enrollment = await repos.enrollments.findByStudentAndCourse(order.email, order.courseId);
    if (enrollment) {
      await repos.enrollments.updateStatus(enrollment.id, "Activo");
    } else {
      await repos.enrollments.create({
        studentEmail: order.email,
        studentName: order.alumno,
        courseId: order.courseId,
        status: "Activo",
      });
    }
  } else {
    const enrollment = await repos.enrollments.findByStudentAndCourse(order.email, order.courseId);
    if (enrollment) {
      await repos.enrollments.updateStatus(
        enrollment.id,
        estado === "Pendiente" ? "Pendiente" : "Revocado",
      );
    }
  }
}

export async function updateSettings(input: {
  companyName: string;
  supportEmail: string;
  logoUrl: string;
  privacyText: string;
}): Promise<SiteSettingsDTO> {
  const settings = await getRepositories().settings.update(input);
  return settingsToDTO(settings, env.paymentsConfigured);
}

export async function listAdminUsers(
  role: "alumno" | "profesor",
  page?: Pagination,
): Promise<StoredUser[]> {
  return getRepositories().users.list(role, page);
}
