import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { api, login, startTestServer, type TestServer } from "./helpers.js";

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
