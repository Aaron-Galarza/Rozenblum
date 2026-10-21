import { env } from "../config/env.js";
import { createMockRepositories } from "./mock.js";
import { createMongooseRepositories } from "./mongoose.js";
import type { Repositories } from "./interfaces.js";

let instance: Repositories | null = null;

export function getRepositories(): Repositories {
  if (!instance) {
    instance =
      env.APP_MODE === "atlas" ? createMongooseRepositories() : createMockRepositories();
    console.log(`[repos] Modo de datos: ${instance.mode}.`);
  }
  return instance;
}

/** Test-only hook so API tests run deterministically in mock mode. */
export function setRepositoriesForTests(repositories: Repositories) {
  instance = repositories;
}

export function resetRepositories() {
  instance = null;
}
