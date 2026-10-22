import { env } from "../config/env.js";
import { createMongooseRepositories } from "./mongoose.js";
import type { Repositories } from "./interfaces.js";

let instance: Repositories | null = null;

export function getRepositories(): Repositories {
  if (!instance) {
    if (env.isTest) throw new Error("Los tests deben inyectar repositorios aislados.");
    instance = createMongooseRepositories();
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
