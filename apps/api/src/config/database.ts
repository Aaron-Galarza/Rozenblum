import mongoose from "mongoose";
import { env } from "./env.js";

/**
 * MongoDB Atlas es la base definitiva de la plataforma.
 *
 * Reglas:
 * - El navegador nunca se conecta a Atlas: sólo la API lo hace.
 * - Las credenciales viven exclusivamente en el entorno del backend.
 * - Si APP_MODE=atlas y la conexión falla, la API falla de forma explícita.
 *   Nunca se degrada silenciosamente a datos mock.
 */
export async function connectDatabase(): Promise<void> {
  if (env.APP_MODE !== "atlas") {
    console.log("[db] APP_MODE=mock — no se abre conexión a MongoDB.");
    return;
  }

  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI no está definida.");
  }

  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB,
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      maxPoolSize: 10,
      retryWrites: true,
    });
    console.log(`[db] Conectado a MongoDB Atlas — base "${env.MONGODB_DB}".`);
  } catch (error) {
    // No incluir la URI ni credenciales en el mensaje.
    const reason = error instanceof Error ? error.message : "error desconocido";
    throw new Error(
      `No se pudo conectar a MongoDB Atlas (${reason}). ` +
        "Verificá MONGODB_URI, el usuario con permisos mínimos y la lista de IP permitidas. " +
        "La API no continuará en modo mock.",
    );
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
