import type { ChangePasswordInput, LoginInput, SessionDTO } from "@rozenblum/shared";
import { createToken } from "../lib/token.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { badRequest, unauthorized } from "../lib/http.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredUser } from "../types.js";
import { userToDTO } from "./mappers.js";

/**
 * Constant hash used when the email does not exist so that the response time
 * does not reveal whether an account is registered. Computed once at startup
 * with the asynchronous scrypt implementation.
 */
const DUMMY_PASSWORD_HASH = hashPassword("rozenblum-invalid-account");

export async function login(input: LoginInput): Promise<SessionDTO> {
  const repos = getRepositories();
  const email = input.email.toLowerCase();
  const user = await repos.users.findByEmail(email);

  const validPassword = await verifyPassword(
    input.password,
    user?.passwordHash ?? (await DUMMY_PASSWORD_HASH),
  );

  if (!user || user.status !== "Activo" || !validPassword) {
    throw unauthorized("Correo o contraseña incorrectos.");
  }

  const token = createToken({
    sub: user.id,
    role: user.role,
    email: user.email,
    ver: user.sessionVersion ?? 0,
  });

  return { token, user: userToDTO(user) };
}

/**
 * Changes the authenticated user's own password after verifying the current
 * one. Returns a new session because the change revokes all previous tokens.
 */
export async function changeOwnPassword(
  user: StoredUser,
  input: ChangePasswordInput,
): Promise<SessionDTO> {
  const repos = getRepositories();
  const current = await repos.users.findById(user.id);
  if (!current) throw unauthorized();

  if (!(await verifyPassword(input.currentPassword, current.passwordHash))) {
    throw badRequest("La contraseña actual no es correcta.");
  }

  const updated = await repos.users.update(
    current.id,
    { passwordHash: await hashPassword(input.newPassword) },
    { revokeSessions: true },
  );
  if (!updated) throw unauthorized();

  return {
    token: createToken({
      sub: updated.id,
      role: updated.role,
      email: updated.email,
      ver: updated.sessionVersion ?? 0,
    }),
    user: userToDTO(updated),
  };
}
