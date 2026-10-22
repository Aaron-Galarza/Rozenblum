import type { Role, SessionDTO } from "@rozenblum/shared";
import { createToken } from "../lib/token.js";
import { verifyPassword } from "../lib/password.js";
import { forbidden, unauthorized } from "../lib/http.js";
import { getRepositories } from "../repositories/index.js";
import { userToDTO } from "./mappers.js";

export async function login(input: {
  role: Role;
  email: string;
  password: string;
}): Promise<SessionDTO> {
  const repos = getRepositories();
  const email = input.email.toLowerCase();
  const user = await repos.users.findByEmail(email);

  if (!user) {
    throw unauthorized("Correo o contraseña incorrectos.");
  }

  if (user.role !== input.role) {
    throw forbidden("El correo pertenece a otro rol. Elegí el rol correcto.");
  }

  if (user.status !== "Activo") {
    throw forbidden("La cuenta está suspendida. Contactá al administrador.");
  }

  if (!verifyPassword(input.password, user.passwordHash)) {
    throw unauthorized("Correo o contraseña incorrectos.");
  }

  const token = createToken({ sub: user.id, role: user.role, email: user.email });

  return { token, user: userToDTO(user) };
}
