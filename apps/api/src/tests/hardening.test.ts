import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { api, login, startTestServer, type TestServer } from "./helpers.js";
import { getRepositories } from "../repositories/index.js";

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

test("health expone liveness y readiness en modo mock", async () => {
  const health = await api<{ data: { status: string; mode: string } }>(server.baseUrl, "/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.data.status, "ok");
  assert.equal(health.body.data.mode, "mock");

  const ready = await api<{ data: { ready: boolean; database: string } }>(
    server.baseUrl,
    "/health/ready",
  );
  assert.equal(ready.status, 200);
  assert.equal(ready.body.data.ready, true);
  assert.equal(ready.body.data.database, "not_required");
});

test("cada respuesta incluye un x-request-id", async () => {
  const response = await fetch(`${server.baseUrl}/health`);
  assert.ok(response.headers.get("x-request-id"));
});

test("los listados del admin aceptan limit y offset", async () => {
  const token = await login(server.baseUrl, "admin");
  const result = await api<{ data: unknown[] }>(
    server.baseUrl,
    "/api/admin/users?role=alumno&limit=2&offset=0",
    { token },
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 2);
});

test("la paginación alcanza registros posteriores al límite de la vista general", async () => {
  const token = await login(server.baseUrl, "admin");
  await Promise.all(Array.from({ length: 1005 }, (_, index) =>
    getRepositories().contacts.create({
      id: `ctc_page_${index}`,
      name: "Prueba de paginación",
      email: "page@example.com",
      message: "Mensaje de prueba",
      createdAt: "2026-10-21T12:00:00.000Z",
    }),
  ));
  const result = await api<{ data: { id: string }[] }>(
    server.baseUrl,
    "/api/admin/contacts?limit=10&offset=1000",
    { token },
  );
  assert.equal(result.status, 200);
  assert.ok(result.body.data.length > 0);
});

test("el login demo se limita por cantidad de intentos", async () => {
  let sawRateLimit = false;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const result = await api(server.baseUrl, "/api/auth/demo-login", {
      method: "POST",
      body: JSON.stringify({ role: "alumno" }),
    });
    if (result.status === 429) sawRateLimit = true;
  }
  assert.ok(sawRateLimit, "esperaba al menos una respuesta 429");
});
