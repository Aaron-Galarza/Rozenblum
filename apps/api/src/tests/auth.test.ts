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

test("la cuenta demo de alumno inicia sesión y devuelve un token usable", async () => {
  const result = await api<{
    data: { token: string; user: { email: string; role: string } };
  }>(server.baseUrl, "/api/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ role: "alumno" }),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.data.user.role, "alumno");
  assert.equal(result.body.data.user.email, "alumno@rozenblum.com");
  assert.ok(result.body.data.token.length > 20);

  const session = await api<{ data: { email: string } }>(server.baseUrl, "/api/auth/session", {
    token: result.body.data.token,
  });
  assert.equal(session.status, 200);
  assert.equal(session.body.data.email, "alumno@rozenblum.com");
});

test("no se puede iniciar sesión con un rol que no corresponde al correo", async () => {
  const result = await api<{ error: { code: string } }>(server.baseUrl, "/api/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ role: "profesor", email: "alumno@rozenblum.com" }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, "FORBIDDEN");
});

test("un rol inexistente es rechazado por validación", async () => {
  const result = await api<{ error: { code: string } }>(server.baseUrl, "/api/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ role: "superadmin" }),
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "BAD_REQUEST");
});

test("sin token, la sesión y las rutas privadas responden 401", async () => {
  const session = await api(server.baseUrl, "/api/auth/session");
  assert.equal(session.status, 401);

  const student = await api(server.baseUrl, "/api/student/enrollments");
  assert.equal(student.status, 401);
});

test("un alumno no puede acceder a rutas de profesor", async () => {
  const token = await login(server.baseUrl, "alumno");
  const result = await api(server.baseUrl, "/api/teacher/dashboard", { token });
  assert.equal(result.status, 403);
});
