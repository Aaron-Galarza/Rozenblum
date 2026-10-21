import type { Role, SessionDTO } from "@rozenblum/shared";
import { env } from "../config/env.js";
import { createToken } from "../lib/token.js";
import { verifyPassword } from "../lib/password.js";
import { forbidden, notFound, unauthorized } from "../lib/http.js";
import { DEMO_EMAILS } from "../seed/data.js";
import { getRepositories } from "../repositories/index.js";
import { userToDTO } from "./mappers.js";

export async function demoLogin(input: {
  role: Role;
  email?: string;
  password?: string;
}): Promise<SessionDTO> {
  const repos = getRepositories();
  const email = (input.email ?? DEMO_EMAILS[input.role]).toLowerCase();
  const user = await repos.users.findByEmail(email);

  if (!user) {
    throw notFound(
      `No existe una cuenta con el correo ${email}. Usá una de las cuentas demo o pedí acceso al administrador.`,
    );
  }

  if (user.role !== input.role) {
    throw forbidden("El correo pertenece a otro rol. Elegí el rol correcto.");
  }

  if (user.status !== "Activo") {
    throw forbidden("La cuenta está suspendida. Contactá al administrador.");
  }

  const isDemoAccount = Object.values(DEMO_EMAILS).includes(
    email as (typeof DEMO_EMAILS)[keyof typeof DEMO_EMAILS],
  );

  if (input.password) {
    if (!verifyPassword(input.password, user.passwordHash)) {
      throw unauthorized("Correo o contraseña incorrectos.");
    }
  } else if (!env.ALLOW_DEMO_LOGIN) {
    throw unauthorized("La contraseña es obligatoria.");
  } else if (!isDemoAccount && env.isProduction) {
    throw unauthorized("La contraseña es obligatoria para esta cuenta.");
  }

  const token = createToken({ sub: user.id, role: user.role, email: user.email });

  return { token, user: userToDTO(user) };
}
