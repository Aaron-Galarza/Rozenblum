import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword } from "../lib/password.js";
import { createMockRepositories } from "../repositories/mock.js";
import { setRepositoriesForTests } from "../repositories/index.js";
import { api, startTestServer } from "./helpers.js";

test("an admin can open and configure an otherwise empty database", async () => {
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
    const empty = await api<{ data: { settings: null; cursos: unknown[] } }>(server.baseUrl, "/api/admin/overview", { token });
    assert.equal(empty.status, 200);
    assert.equal(empty.body.data.settings, null);
    assert.deepEqual(empty.body.data.cursos, []);
    assert.equal((await api(server.baseUrl, "/api/settings")).status, 404);

    const input = {
      companyName: "Estudio de prueba",
      supportEmail: "soporte@example.test",
      contactWhatsapp: "5491112345678",
      logoUrl: "",
      privacyText: "Política de privacidad de prueba.",
    };
    assert.equal((await api(server.baseUrl, "/api/admin/settings", {
      method: "PUT", token, body: JSON.stringify(input),
    })).status, 200);
    const saved = await api<{ data: { companyName: string } }>(server.baseUrl, "/api/settings");
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.companyName, input.companyName);
  } finally {
    await server.close();
  }
});
