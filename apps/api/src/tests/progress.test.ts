import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { api, login, startTestServer, type TestServer } from "./helpers.js";

type Enrollment = {
  id: string;
  courseId: number;
  progress: number;
  status: string;
  modules: { id: number; status: string; lessons: { id: string; done: boolean }[] }[];
};

let server: TestServer;
let token: string;
let enrollment: Enrollment;

before(async () => {
  server = await startTestServer();
  token = await login(server.baseUrl, "alumno");

  const result = await api<{ data: Enrollment[] }>(server.baseUrl, "/api/student/enrollments", {
    token,
  });
  assert.equal(result.status, 200);
  const found = result.body.data.find((item) => item.courseId === 5);
  assert.ok(found, "El alumno demo debe tener la inscripción al curso de prueba.");
  enrollment = found;
});

after(async () => {
  await server.close();
});

test("el progreso inicial coincide con el prototipo (60%) y los módulos derivan su estado", () => {
  assert.equal(enrollment.progress, 60);
  assert.equal(enrollment.status, "Activo");
  assert.deepEqual(
    enrollment.modules.map((mod) => mod.status),
    ["completed", "in_progress", "locked", "locked"],
  );
  assert.deepEqual(
    enrollment.modules[0]?.lessons.map((lesson) => lesson.done),
    [true, true],
  );
  assert.ok(enrollment.modules.filter((mod) => mod.status === "locked").every(
    (mod) => mod.lessons.every((lesson) => !('content' in lesson) || (lesson as { content: unknown[] }).content.length === 0),
  ));
});

test("una inscripción pendiente no entrega lecciones ni habilita la mensajería", async () => {
  const checkout = await api(server.baseUrl, "/api/checkout", {
    method: "POST",
    body: JSON.stringify({
      courseSlug: "actualizacion-derecho-familia",
      nombre: "Juan García",
      email: "alumno@rozenblum.com",
      dni: "30111222",
    }),
  });
  assert.equal(checkout.status, 201);

  const listed = await api<{ data: Enrollment[] }>(server.baseUrl, "/api/student/enrollments", { token });
  const pending = listed.body.data.find((item) => item.courseId === 3);
  assert.ok(pending);
  assert.equal(pending.status, "Pendiente");
  assert.ok(pending.modules.every((mod) => mod.lessons.every(
    (lesson) => !('content' in lesson) || (lesson as { content: unknown[] }).content.length === 0,
  )));

  const messages = await api(server.baseUrl, `/api/student/enrollments/${pending.id}/messages`, { token });
  assert.equal(messages.status, 403);
});

test("una lección de un módulo bloqueado no se puede completar", async () => {
  const result = await api(server.baseUrl, `/api/student/enrollments/${enrollment.id}/progress`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ lessonId: "3.1", completed: true }),
  });
  assert.equal(result.status, 403);
});

test("marcar una lección recalcula el progreso de toda la inscripción", async () => {
  const result = await api<{ data: Enrollment }>(
    server.baseUrl,
    `/api/student/enrollments/${enrollment.id}/progress`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify({ lessonId: "2.2", completed: true }),
    },
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.progress, 80);
  assert.equal(result.body.data.modules[1]?.status, "completed");
  assert.equal(result.body.data.modules[2]?.status, "in_progress");
});

test("completar la última lección marca la inscripción como Completado y desmarcar la reabre", async () => {
  const complete = await api<{ data: Enrollment }>(
    server.baseUrl,
    `/api/student/enrollments/${enrollment.id}/progress`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify({ lessonId: "3.1", completed: true }),
    },
  );

  assert.equal(complete.status, 200);
  assert.equal(complete.body.data.progress, 100);
  assert.equal(complete.body.data.status, "Completado");

  const reopen = await api<{ data: Enrollment }>(
    server.baseUrl,
    `/api/student/enrollments/${enrollment.id}/progress`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify({ lessonId: "3.1", completed: false }),
    },
  );

  assert.equal(reopen.status, 200);
  assert.equal(reopen.body.data.progress, 80);
  assert.equal(reopen.body.data.status, "Activo");
});

test("una lección que no pertenece al curso es rechazada", async () => {
  const result = await api<{ error: { code: string } }>(
    server.baseUrl,
    `/api/student/enrollments/${enrollment.id}/progress`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify({ lessonId: "99.9", completed: true }),
    },
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "BAD_REQUEST");
});

test("el chat del aula devuelve el historial y acepta mensajes nuevos", async () => {
  const history = await api<{ data: { id: string; text: string }[] }>(
    server.baseUrl,
    `/api/student/enrollments/${enrollment.id}/messages`,
    { token },
  );
  assert.equal(history.status, 200);
  assert.equal(history.body.data.length, 3);

  const sent = await api<{ data: { id: string; text: string }[] }>(
    server.baseUrl,
    `/api/student/enrollments/${enrollment.id}/messages`,
    {
      method: "POST",
      token,
      body: JSON.stringify({ text: "Consulta de prueba automatizada." }),
    },
  );

  assert.equal(sent.status, 201);
  assert.equal(sent.body.data.length, 4);
  assert.equal(sent.body.data.at(-1)?.text, "Consulta de prueba automatizada.");
});

test("el profesor gestiona módulos y lecciones de su curso", async () => {
  const teacherToken = await login(server.baseUrl, "profesor");

  const structure = await api<{
    data: { course: { id: number }; modules: { id: number; lessons: unknown[] }[] };
  }>(server.baseUrl, "/api/teacher/courses/5", { token: teacherToken });
  assert.equal(structure.status, 200);
  assert.equal(structure.body.data.modules.length, 4);

  const emptyModule = structure.body.data.modules.find((mod) => mod.lessons.length === 0);
  assert.ok(emptyModule, "El curso demo debe tener un módulo vacío para probar altas.");

  const created = await api<{ data: { id: number; lessons: { id: string; title: string }[] }[] }>(
    server.baseUrl,
    `/api/teacher/courses/5/modules/${emptyModule.id}/lessons`,
    {
      method: "POST",
      token: teacherToken,
      body: JSON.stringify({
        title: "Lección creada por test",
        type: "pdf",
        content: [{ id: "blk_test", type: "paragraph", content: "Contenido de prueba." }],
      }),
    },
  );

  assert.equal(created.status, 201);
  const target = created.body.data.find((mod) => mod.id === emptyModule.id);
  assert.equal(target?.lessons.length, 1);
  assert.equal(target?.lessons[0]?.title, "Lección creada por test");

  const lessonId = target!.lessons[0]!.id;

  const updated = await api<{ data: { id: number; lessons: { id: string; title: string }[] }[] }>(
    server.baseUrl,
    `/api/teacher/courses/5/modules/${emptyModule.id}/lessons/${lessonId}`,
    {
      method: "PATCH",
      token: teacherToken,
      body: JSON.stringify({ title: "Lección editada por test" }),
    },
  );
  assert.equal(updated.status, 200);
  assert.equal(
    updated.body.data.find((mod) => mod.id === emptyModule.id)?.lessons[0]?.title,
    "Lección editada por test",
  );

  const removed = await api<{ data: { id: number; lessons: unknown[] }[] }>(
    server.baseUrl,
    `/api/teacher/courses/5/modules/${emptyModule.id}/lessons/${lessonId}`,
    { method: "DELETE", token: teacherToken },
  );
  assert.equal(removed.status, 200);
  assert.equal(removed.body.data.find((mod) => mod.id === emptyModule.id)?.lessons.length, 0);
});

test("un profesor no puede editar cursos de otro profesor ni el panel admin", async () => {
  const teacherToken = await login(server.baseUrl, "profesor");

  const foreign = await api(server.baseUrl, "/api/teacher/courses/3", { token: teacherToken });
  assert.equal(foreign.status, 403);

  const admin = await api(server.baseUrl, "/api/admin/overview", { token: teacherToken });
  assert.equal(admin.status, 403);
});
