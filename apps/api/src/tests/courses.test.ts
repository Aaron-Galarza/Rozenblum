import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { api, startTestServer, type TestServer } from "./helpers.js";

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

test("el catálogo público sólo expone cursos publicados", async () => {
  const result = await api<{ data: { slug: string; status: string }[] }>(
    server.baseUrl,
    "/api/courses",
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 5);
  assert.ok(result.body.data.every((course) => course.status === "published"));
  assert.ok(!result.body.data.some((course) => course.slug === "contratos-civiles-comerciales"));
});

test("el detalle público devuelve el temario y los módulos sin contenido de lecciones", async () => {
  const result = await api<{
    data: {
      course: { slug: string; priceCents: number };
      modules: { lessons: { content?: unknown }[] }[];
    };
  }>(server.baseUrl, "/api/courses/derecho-penal-basico");

  assert.equal(result.status, 200);
  assert.equal(result.body.data.course.slug, "derecho-penal-basico");
  assert.equal(result.body.data.course.priceCents, 4_000_000);
  assert.equal(result.body.data.modules.length, 4);
  assert.ok(
    result.body.data.modules.every((mod) => mod.lessons.every((lesson) => !lesson.content)),
  );
});

test("un curso inexistente o en borrador responde 404", async () => {
  const missing = await api(server.baseUrl, "/api/courses/no-existe");
  assert.equal(missing.status, 404);

  const draft = await api(server.baseUrl, "/api/courses/contratos-civiles-comerciales");
  assert.equal(draft.status, 404);
});

test("el checkout crea una orden pendiente y una inscripción pendiente", async () => {
  const result = await api<{
    data: {
      order: { id: string; externalReference: string; estado: string };
      enrollment: { status: string; progress: number };
      message: string;
    };
  }>(server.baseUrl, "/api/checkout", {
    method: "POST",
    body: JSON.stringify({
      courseSlug: "derecho-laboral-practico",
      nombre: "Test Persona",
      email: "test.persona@email.com",
      dni: "30111222",
    }),
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.data.order.estado, "Pendiente");
  assert.match(result.body.data.order.externalReference, /^RB-\d{4}-[A-F0-9]{20}$/);
  assert.equal(result.body.data.enrollment.status, "Pendiente");
  assert.equal(result.body.data.enrollment.progress, 0);
});

test("un segundo checkout no crea otra orden para la misma inscripción", async () => {
  const body = JSON.stringify({
    courseSlug: "derecho-laboral-practico",
    nombre: "Test Persona",
    email: "test.persona@email.com",
    dni: "30111222",
  });
  const duplicate = await api(server.baseUrl, "/api/checkout", { method: "POST", body });
  assert.equal(duplicate.status, 400);

  const admin = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ role: "admin" }),
  });
  const overview = await api<{ data: { orders: { alumno: string; courseSlug: string }[] } }>(
    server.baseUrl,
    "/api/admin/overview",
    { token: admin.body.data.token },
  );
  assert.equal(overview.body.data.orders.filter(
    (order) => order.alumno === "Test Persona" && order.courseSlug === "derecho-laboral-practico",
  ).length, 1);
});

test("rechazar un pago revoca el acceso y volver a pagarlo lo restaura", async () => {
  const created = await api<{ data: { order: { id: string }; enrollment: { id: string } } }>(
    server.baseUrl,
    "/api/checkout",
    {
      method: "POST",
      body: JSON.stringify({
        courseSlug: "litigacion-oral",
        nombre: "Pago de Prueba",
        email: "pago.prueba@email.com",
        dni: "30111222",
      }),
    },
  );
  assert.equal(created.status, 201);

  const admin = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ role: "admin" }),
  });
  const orderId = created.body.data.order.id;
  const enrollmentId = created.body.data.enrollment.id;
  for (const [orderStatus, enrollmentStatus] of [
    ["Pagado", "Activo"],
    ["Reembolsado", "Revocado"],
    ["Pagado", "Activo"],
  ] as const) {
    const changed = await api(server.baseUrl, `/api/admin/orders/${orderId}`, {
      method: "PATCH",
      token: admin.body.data.token,
      body: JSON.stringify({ estado: orderStatus }),
    });
    assert.equal(changed.status, 200);
    const overview = await api<{ data: { inscripciones: { id: string; estado: string }[] } }>(
      server.baseUrl,
      "/api/admin/overview",
      { token: admin.body.data.token },
    );
    assert.equal(overview.body.data.inscripciones.find((item) => item.id === enrollmentId)?.estado, enrollmentStatus);
  }
});

test("el comprobante exige que el correo coincida con la orden", async () => {
  const created = await api<{ data: { order: { externalReference: string } } }>(
    server.baseUrl,
    "/api/checkout",
    {
      method: "POST",
      body: JSON.stringify({
        courseSlug: "actualizacion-derecho-familia",
        nombre: "Otra Persona",
        email: "otra.persona@email.com",
        dni: "28999888",
      }),
    },
  );

  const reference = created.body.data.order.externalReference;

  const ok = await api(server.baseUrl, `/api/orders/${reference}?email=otra.persona@email.com`);
  assert.equal(ok.status, 200);

  const wrong = await api(server.baseUrl, `/api/orders/${reference}?email=intruso@email.com`);
  assert.equal(wrong.status, 404);

  const missing = await api(server.baseUrl, `/api/orders/${reference}`);
  assert.equal(missing.status, 404);
});

test("el formulario de contacto valida y persiste el mensaje", async () => {
  const invalid = await api(server.baseUrl, "/api/contact", {
    method: "POST",
    body: JSON.stringify({ name: "Ab", email: "no-es-email", message: "corto" }),
  });
  assert.equal(invalid.status, 400);

  const ok = await api<{ data: { id: string } }>(server.baseUrl, "/api/contact", {
    method: "POST",
    body: JSON.stringify({
      name: "Ana Consulta",
      email: "ana@email.com",
      message: "Quisiera información sobre el curso de derecho penal básico.",
    }),
  });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.data.id.startsWith("ctc_"));
});
