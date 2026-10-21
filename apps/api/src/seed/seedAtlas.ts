/**
 * Seed idempotente y NO destructivo para MongoDB Atlas.
 *
 * - Sólo inserta documentos que no existen (clave natural por colección).
 * - Nunca hace drop, deleteMany ni sobrescribe documentos existentes.
 * - Se puede correr varias veces sin duplicar datos.
 *
 * Uso:
 *   APP_MODE=atlas MONGODB_URI="mongodb+srv://..." npm run seed:atlas
 */
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { hashPassword } from "../lib/password.js";
import { nowIso } from "../lib/utils.js";
import {
  ContactModel,
  ConversationModel,
  CourseModel,
  EnrollmentModel,
  OrderModel,
  SettingsModel,
  UserModel,
} from "../models/index.js";
import {
  SEED_CONTACTS,
  SEED_CONVERSATIONS,
  SEED_COURSES,
  SEED_ENROLLMENTS,
  SEED_ORDERS,
  SEED_SETTINGS,
  SEED_USERS,
} from "./data.js";

async function upsertMany<T extends object>(
  label: string,
  model: mongoose.Model<T>,
  documents: T[],
  keyOf: (doc: T) => Record<string, unknown>,
) {
  if (documents.length === 0) {
    console.log(`[seed] ${label}: nada para sembrar.`);
    return;
  }

  let created = 0;
  for (const doc of documents) {
    const filter = keyOf(doc) as unknown as mongoose.QueryFilter<T>;
    const update = { $setOnInsert: doc } as unknown as mongoose.UpdateQuery<T>;
    const result = await model.updateOne(filter, update, { upsert: true });
    if (result.upsertedCount > 0) created += 1;
  }

  console.log(
    `[seed] ${label}: ${created} nuevos, ${documents.length - created} ya existentes.`,
  );
}

async function main() {
  if (env.APP_MODE !== "atlas") {
    throw new Error(
      "seed:atlas requiere APP_MODE=atlas. No se siembra la base mock (es efímera y vive en memoria).",
    );
  }

  await connectDatabase();

  if (env.SEED_SKIP_IF_POPULATED) {
    const existing = await CourseModel.estimatedDocumentCount();
    if (existing > 0) {
      console.log(
        `[seed] SEED_SKIP_IF_POPULATED=true y ya existen ${existing} cursos: no se inserta nada.`,
      );
      await disconnectDatabase();
      return;
    }
  }

  const passwordHash = hashPassword(env.DEMO_PASSWORD);

  await upsertMany(
    "usuarios",
    UserModel,
    SEED_USERS.map((user) => ({ ...user, passwordHash })),
    (user) => ({ email: user.email.toLowerCase() }),
  );

  await upsertMany("cursos", CourseModel, SEED_COURSES, (course) => ({
    legacyId: course.legacyId,
  }));

  await upsertMany("inscripciones", EnrollmentModel, SEED_ENROLLMENTS, (enrollment) => ({
    id: enrollment.id,
  }));

  await upsertMany("órdenes", OrderModel, SEED_ORDERS, (order) => ({ id: order.id }));

  await upsertMany("conversaciones", ConversationModel, SEED_CONVERSATIONS, (conversation) => ({
    id: conversation.id,
  }));

  await upsertMany("contactos", ContactModel, SEED_CONTACTS, (contact) => ({ id: contact.id }));

  const hasSettings = (await SettingsModel.estimatedDocumentCount()) > 0;
  if (hasSettings) {
    console.log("[seed] configuración del sitio: ya existente, no se modifica.");
  } else {
    await SettingsModel.create({ ...SEED_SETTINGS, updatedAt: nowIso() });
    console.log("[seed] configuración del sitio: creada.");
  }

  console.log(
    `[seed] Listo. Cuentas demo: ${Object.values(SEED_USERS)
      .filter((user) => user.id.startsWith("usr_") && user.role !== "alumno")
      .slice(0, 3)
      .map((user) => user.email)
      .join(", ")}`,
  );
  console.log(`[seed] Contraseña demo (sólo para cuentas demo): definida por DEMO_PASSWORD.`);
}

main()
  .catch((error) => {
    console.error("[seed] Error:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
