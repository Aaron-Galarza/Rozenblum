import mongoose from "mongoose";
import { env } from "./env.js";

/** Atlas is the only runtime data store; tests inject isolated repositories. */
export async function connectDatabase(): Promise<void> {
  if (env.isTest) return;

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
  } catch {
    throw new Error(
      "No se pudo conectar a MongoDB Atlas. " +
        "Verificá la conexión, el usuario de base y la lista de IP permitidas.",
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

/** Readiness probe used by orchestrators. */
export async function checkDatabaseHealth(): Promise<boolean> {
  if (env.isTest) return true;
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db?.admin().ping();
    return true;
  } catch {
    return false;
  }
}
