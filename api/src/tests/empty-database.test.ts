import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword } from "../lib/password.js";
import { BRAND_HERO_URL } from "@rozenblum/shared";
import { createMockRepositories } from "../repositories/mock.js";
import { setRepositoriesForTests } from "../repositories/index.js";
import { api, startTestServer } from "./helpers.js";

test("an admin can open an empty database while the public home keeps its fixed brand", async () => {
  const repos = createMockRepositories();
  setRepositoriesForTests(repos);
  await repos.users.create({
    name: "Administrador",
    email: "admin@example.test",
    role: "admin",
    initials: "AD",
    passwordHash: await hashPassword("test-password-12345"),
  });
  const server = await startTestServer();
  try {
    const login = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.test", password: "test-password-12345" }),
    });
    assert.equal(login.status, 200);
    const token = login.body.data.token;
    const empty = await api<{ data: { cursos: unknown[] } }>(server.baseUrl, "/api/admin/overview", { token });
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.data.cursos, []);
    assert.equal((await api(server.baseUrl, "/api/settings")).status, 404);
    assert.equal((await api(server.baseUrl, "/api/admin/settings", { token })).status, 404);
    const home = await api<{ data: { brand: { heroImage: string }; team: unknown[] } }>(server.baseUrl, "/api/content/home");
    assert.equal(home.status, 200);
    assert.equal(home.body.data.brand.heroImage, BRAND_HERO_URL);
    assert.deepEqual(home.body.data.team, []);
  } finally {
    await server.close();
  }
});
