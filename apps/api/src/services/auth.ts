import type { Role, SessionDTO } from "@rozenblum/shared";
import { createToken } from "../lib/token.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { unauthorized } from "../lib/http.js";
import { getRepositories } from "../repositories/index.js";
import { userToDTO } from "./mappers.js";

/**
 * Constant hash used when the email does not exist so that the response time
 * does not reveal whether an account is registered.
 */
const DUMMY_PASSWORD_HASH = hashPassword("rozenblum-invalid-account");

export async function login(input: {
  role: Role;
  email: string;
  password: string;
}): Promise<SessionDTO> {
  const repos = getRepositories();
  const email = input.email.toLowerCase();
  const user = await repos.users.findByEmail(email);

  const validPassword = verifyPassword(
    input.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || user.role !== input.role || user.status !== "Activo" || !validPassword) {
    throw unauthorized("Correo o contraseña incorrectos.");
  }

  const token = createToken({ sub: user.id, role: user.role, email: user.email });

  return { token, user: userToDTO(user) };
}
