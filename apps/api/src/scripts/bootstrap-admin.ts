/**
 * Idempotent bootstrap for the first administrator.
 *
 * There is intentionally no public/admin endpoint that creates admin accounts.
 * Run this script once per environment:
 *
 *   BOOTSTRAP_ADMIN_PASSWORD=<secret> npm --workspace @rozenblum/api run bootstrap:admin -- admin@estudio.com
 *
 * Re-running it with the same administrator is a no-op. A different email
 * cannot create another administrator through this bootstrap. It also creates
 * the site settings document when missing, without publishing fake contact data.
 */
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { SettingsModel, UserModel } from "../models/index.js";
import { hashPassword } from "../lib/password.js";
import { initialsFromName, newId, nowIso } from "../lib/utils.js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Uso: definí BOOTSTRAP_ADMIN_PASSWORD en el entorno y ejecutá bootstrap:admin -- correo@ejemplo.com");
  process.exit(1);
}
if (process.argv[3]) {
  console.error("No pases la contraseña como argumento: quedaría en el historial y en la lista de procesos.");
  process.exit(1);
}
if (password.length < 12 || password.length > 128) {
  console.error("BOOTSTRAP_ADMIN_PASSWORD debe tener entre 12 y 128 caracteres.");
  process.exit(1);
}

async function main() {
  await connectDatabase();

  const existingAdmin = await UserModel.findOne({ role: "admin" }).lean().exec();
  if (existingAdmin && existingAdmin.email !== email) {
    throw new Error("Ya existe un administrador con otro correo. El bootstrap solo crea el primero.");
  }
  if (!existingAdmin) {
    const existingEmail = await UserModel.findOne({ email }).lean().exec();
    if (existingEmail) throw new Error("El correo pertenece a otra cuenta.");
    await UserModel.create({
      id: newId("usr"),
      name: "Administrador",
      email,
      role: "admin",
      status: "Activo",
      initials: initialsFromName("Administrador"),
      passwordHash: await hashPassword(password),
      sessionVersion: 0,
      createdAt: nowIso(),
    });
  }

  const settings = await SettingsModel.findOne({}).lean().exec();
  if (!settings) {
    await SettingsModel.create({
      companyName: "Estudio Jurídico Rozenblum",
      supportEmail: email,
      contactWhatsapp: "",
      logoUrl: "",
      privacyText: "",
      updatedAt: nowIso(),
    });
  }

  console.log(existingAdmin ? "El administrador ya existía; no se modificó la cuenta." : "Primer administrador creado.");
}

main()
  .catch((error) => {
    console.error(
      "No se pudo crear el administrador:",
      error instanceof Error ? error.message : "Error desconocido.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
