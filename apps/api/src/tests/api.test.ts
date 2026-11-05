import assert from "node:assert/strict";
import { createHmac, scryptSync } from "node:crypto";
import { after, before, test } from "node:test";
import { loginSchema } from "@rozenblum/shared";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { createMockRepositories } from "../repositories/mock.js";
import { setRepositoriesForTests } from "../repositories/index.js";
import { parseYouTubeId } from "../services/youtube.js";
import { login as loginService } from "../services/auth.js";
import { moduleStatuses } from "../services/mappers.js";
import { detectImageFormat, isManagedImageUrl, mediaFolder } from "../services/media.js";
import { setPaymentGatewayForTests, type PaymentSnapshot } from "../services/mercadopago.js";
import { api, startTestServer, type TestServer } from "./helpers.js";

const password = "test-password-12345";
/** Students authenticate with their DNI, which is their initial password. */
const studentDni = "30123456";
const studentEmail = "student@example.test";
const teacherEmail = "teacher@example.test";
const adminEmail = "admin@example.test";
const repositories = createMockRepositories({
  homeContent: {
    key: "home",
    brand: {
      locationLabel: "Buenos Aires",
      foundedYear: "2020",
      heroImage: "https://res.cloudinary.com/test-cloud/image/upload/v1/Rozenblum/brand/hero.jpg",
      metrics: [{ value: "5", label: "Años" }],
      aboutParagraphs: ["Contenido institucional de prueba."],
      footerTagline: "Estudio de prueba",
    },
    team: [{ name: "Test profesor", role: "Docente", img: "https://example.test/team.jpg" }],
    practiceAreas: [{ title: "Derecho", desc: "Área de prueba", icon: "briefcase", casos: [] }],
  },
  settings: {
    companyName: "Test Company",
    supportEmail: "support@example.test",
    contactWhatsapp: "5491112345678",
    logoUrl: "",
    privacyText: "Test privacy text for the isolated API tests.",
    updatedAt: new Date().toISOString(),
  },
});

test("asynchronous scrypt verifies hashes created by the previous synchronous implementation", async () => {
  const salt = "00112233445566778899aabbccddeeff";
  const legacy = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
  assert.equal(await verifyPassword(password, legacy), true);
  assert.equal(await verifyPassword("incorrect", legacy), false);
  const fresh = await hashPassword(password);
  assert.match(fresh, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(await verifyPassword(password, fresh), true);
});

let server: TestServer;
let courseId: number;
let enrollmentId: string;

/** Cache main tokens so the login rate limiter is not exhausted by setup. */
const sessionTokens = new Map<string, string>();

async function login(
  role: "alumno" | "profesor" | "admin",
  email: string,
  candidate = role === "alumno" ? studentDni : password,
) {
  const cacheKey = `${role}:${email}:${candidate}`;
  const cached = sessionTokens.get(cacheKey);
  if (cached) return cached;

  const response = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ role, email, password: candidate }),
  });
  assert.equal(response.status, 200);
  sessionTokens.set(cacheKey, response.body.data.token);
  return response.body.data.token;
}

async function rawLogin(
  role: "alumno" | "profesor" | "admin",
  email: string,
  candidate: string,
) {
  return api<{ data: { token: string } | null; error?: { message: string } }>(
    server.baseUrl,
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ role, email, password: candidate }) },
  );
}

before(async () => {
  setRepositoriesForTests(repositories);
  for (const [role, email] of [
    ["alumno", studentEmail],
    ["profesor", teacherEmail],
    ["admin", adminEmail],
  ] as const) {
    await repositories.users.create({
      name: `Test ${role}`,
      email,
      role,
      initials: "TT",
      passwordHash: await hashPassword(role === "alumno" ? studentDni : password),
    });
  }
  const course = await repositories.courses.create({
    title: "Test Course",
    description: "An isolated course for API integration tests.",
    priceCents: 100_000,
    duration: "On-Demand",
    level: "Inicial",
    professor: "Test profesor",
    professorEmail: teacherEmail,
    status: "published",
    img: "https://example.test/course.jpg",
  });
  courseId = course.legacyId;
  await repositories.courses.saveModules(courseId, [
    { id: 1, title: "First module", position: 1, lessons: [
      { id: "1.1", title: "First lesson", type: "doc", position: 1, content: [] },
    ] },
    { id: 2, title: "Second module", position: 2, lessons: [
      { id: "2.1", title: "Second lesson", type: "doc", position: 1, content: [] },
    ] },
  ], 0);
  const enrollment = await repositories.enrollments.create({
    studentEmail,
    studentName: "Test alumno",
    courseId,
    status: "Activo",
  });
  enrollmentId = enrollment.id;
  server = await startTestServer();
});

after(async () => {
  await server?.close();
});

test("health and request IDs work without a live database in isolated tests", async () => {
  const response = await fetch(`${server.baseUrl}/health/ready`);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("x-request-id"));
});

test("login requires a valid email, password, and role", async () => {
  const missing = await api(server.baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ role: "admin", email: adminEmail }),
  });
  assert.equal(missing.status, 400);
  const wrong = await api(server.baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ role: "admin", email: adminEmail, password: "wrong" }),
  });
  assert.equal(wrong.status, 401);
  assert.equal(loginSchema.safeParse({
    role: "admin", email: adminEmail, password: "x".repeat(129),
  }).success, false);
  const token = await login("admin", adminEmail);
  const session = await api(server.baseUrl, "/api/auth/session", { token });
  assert.equal(session.status, 200);
  for (const email of ["missing@example.test", studentEmail]) {
    await assert.rejects(
      loginService({ role: "admin", email, password }),
      (error: unknown) => {
        const candidate = error as { status?: number; message?: string };
        return candidate.status === 401 && candidate.message === "Correo o contraseña incorrectos.";
      },
    );
  }
});

test("published courses expose metadata while lesson content remains private", async () => {
  const list = await api<{ data: { slug: string; professorId?: string }[] }>(server.baseUrl, "/api/courses");
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0]?.professorId, undefined);
  const detail = await api<{ data: { modules: { lessons: { content?: unknown }[] }[] } }>(
    server.baseUrl, `/api/courses/${list.body.data[0]?.slug}`,
  );
  assert.equal(detail.status, 200);
  assert.ok(detail.body.data.modules.every((module) => module.lessons.every((lesson) => !lesson.content)));
  assert.equal(JSON.stringify(detail.body).includes(teacherEmail), false);
});

test("home content uses the injected repository and an absent document returns 404", async () => {
  const home = await api<{ data: { brand: { locationLabel: string; heroImage: string } } }>(
    server.baseUrl, "/api/content/home",
  );
  assert.equal(home.status, 200);
  assert.equal(home.body.data.brand.locationLabel, "Buenos Aires");
  assert.equal(JSON.stringify(home.body).includes("userId"), false);
  assert.equal(JSON.stringify(home.body).includes("_id"), false);

  const withoutHome = createMockRepositories();
  setRepositoriesForTests(withoutHome);
  try {
    const missing = await api(server.baseUrl, "/api/content/home");
    assert.equal(missing.status, 404);
  } finally {
    setRepositoriesForTests(repositories);
  }
});

test("latest course endpoint ignores drafts and exposes only public information", async () => {
  const newer = await repositories.courses.create({
    title: "Newest published course", description: "A public course.", priceCents: 75000,
    duration: "Online", level: "Inicial", professor: "Test profesor",
    professorEmail: teacherEmail, status: "published", img: "https://example.test/new.jpg",
  });
  const draft = await repositories.courses.create({
    title: "Newest draft", description: "An unpublished course.", priceCents: 75000,
    duration: "Online", level: "Inicial", professor: "Test profesor",
    professorEmail: teacherEmail, status: "draft", img: "https://example.test/draft.jpg",
  });
  try {
    const response = await api<{ data: { course: { slug: string }; modules: { lessons: { content?: unknown; document?: unknown }[] }[] } }>(server.baseUrl, "/api/courses/latest");
    assert.equal(response.status, 200);
    assert.equal(response.body.data.course.slug, newer.slug);
    assert.ok(response.body.data.modules.every((module) => module.lessons.every((lesson) => !lesson.content && !lesson.document)));
  } finally {
    await repositories.courses.delete(draft.legacyId, draft.revision ?? 0);
    await repositories.courses.delete(newer.legacyId, newer.revision ?? 0);
  }
});

test("image gallery requires authentication and restricts folder and file types", async () => {
  assert.equal(mediaFolder("courses"), "Rozenblum/courses");
  assert.equal(isManagedImageUrl("https://res.cloudinary.com/test-cloud/image/upload/v1/Rozenblum/courses/cover.jpg", "courses"), true);
  assert.equal(isManagedImageUrl("https://res.cloudinary.com/other/image/upload/v1/Rozenblum/courses/cover.jpg", "courses"), false);
  assert.equal(isManagedImageUrl("https://res.cloudinary.com/test-cloud/image/upload/v1/Rozenblum/brand/logo.jpg", "courses"), false);
  assert.equal(detectImageFormat(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "png");
  assert.equal(detectImageFormat(Buffer.from("<svg onload=alert(1)>")), null);
  assert.equal((await api(server.baseUrl, "/api/media/courses")).status, 401);
  const teacherToken = await login("profesor", teacherEmail);
  assert.equal((await api(server.baseUrl, "/api/media/brand", { token: teacherToken })).status, 403);
  assert.equal((await api(server.baseUrl, "/api/admin/content/home/images", {
    method: "PUT", token: teacherToken, body: JSON.stringify({ heroImage: "https://example.test/hero.jpg" }),
  })).status, 403);
  const adminToken = await login("admin", adminEmail);
  assert.equal((await api(server.baseUrl, "/api/admin/content/home/images", {
    method: "PUT", token: adminToken, body: JSON.stringify({ heroImage: "https://example.test/hero.jpg" }),
  })).status, 400);
  const invalid = await fetch(`${server.baseUrl}/api/media/courses`, {
    method: "POST",
    headers: { "content-type": "image/png", authorization: `Bearer ${teacherToken}` },
    body: Buffer.from("not-a-png"),
  });
  assert.equal(invalid.status, 400);

  const asset = {
    asset_id: "test-asset",
    public_id: "Rozenblum/courses/test-asset",
    secure_url: "https://res.cloudinary.com/test-cloud/image/upload/v1/Rozenblum/courses/test-asset.png",
    asset_folder: "Rozenblum/courses",
    resource_type: "image",
    width: 1,
    height: 1,
    bytes: 8,
    format: "png",
    created_at: new Date().toISOString(),
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://api.cloudinary.com/v1_1/test-cloud/image/upload")) {
      const body = init?.body as FormData;
      assert.equal(body.get("asset_folder"), "Rozenblum/courses");
      assert.equal(body.get("use_asset_folder_as_public_id_prefix"), "true");
      return new Response(JSON.stringify(asset), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.startsWith("https://api.cloudinary.com/v1_1/test-cloud/resources/by_asset_folder")) {
      assert.equal(new URL(url).searchParams.get("asset_folder"), "Rozenblum/courses");
      return new Response(JSON.stringify({ resources: [asset] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };
  try {
    const uploaded = await fetch(`${server.baseUrl}/api/media/courses`, {
      method: "POST",
      headers: { "content-type": "image/png", authorization: `Bearer ${teacherToken}` },
      body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json() as { data: { url: string } };
    assert.equal(uploadedBody.data.url, asset.secure_url);
    const gallery = await api<{ data: { images: { url: string }[] } }>(
      server.baseUrl, "/api/media/courses", { token: teacherToken },
    );
    assert.equal(gallery.status, 200);
    assert.deepEqual(gallery.body.data.images.map((image) => image.url), [asset.secure_url]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("student progress unlocks modules and teacher edits stay role guarded", async () => {
  const studentToken = await login("alumno", studentEmail);
  const teacherToken = await login("profesor", teacherEmail);
  const locked = await api(server.baseUrl, `/api/student/enrollments/${enrollmentId}/progress`, {
    method: "PATCH", token: studentToken, body: JSON.stringify({ lessonId: "2.1", completed: true }),
  });
  assert.equal(locked.status, 403);
  const first = await api<{ data: { progress: number } }>(server.baseUrl, `/api/student/enrollments/${enrollmentId}/progress`, {
    method: "PATCH", token: studentToken, body: JSON.stringify({ lessonId: "1.1", completed: true }),
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.progress, 50);
  const second = await api<{ data: { progress: number } }>(server.baseUrl, `/api/student/enrollments/${enrollmentId}/progress`, {
    method: "PATCH", token: studentToken, body: JSON.stringify({ lessonId: "2.1", completed: true }),
  });
  assert.equal(second.body.data.progress, 100);
  const teacher = await api(server.baseUrl, `/api/teacher/courses/${courseId}`, { token: teacherToken });
  assert.equal(teacher.status, 200);
  const forbidden = await api(server.baseUrl, `/api/teacher/courses/${courseId}`, { token: studentToken });
  assert.equal(forbidden.status, 403);
});

test("checkout, receipt, and admin payment activation work together", async () => {
  const otherCourse = await repositories.courses.create({
    title: "Second Test Course", description: "Additional isolated checkout course.",
    priceCents: 200_000, duration: "On-Demand", level: "Inicial", img: "https://example.test/second.jpg",
    professor: "Test profesor", professorEmail: teacherEmail, status: "published",
  });
  const checkout = await api<{ data: { order: { id: string; externalReference: string }; enrollment: { id: string } } }>(
    server.baseUrl, "/api/checkout", { method: "POST", body: JSON.stringify({
      courseSlug: otherCourse.slug, nombre: "Test alumno", email: studentEmail, dni: studentDni,
    }) },
  );
  assert.equal(checkout.status, 201);
  const receipt = await api(server.baseUrl, `/api/orders/${checkout.body.data.order.externalReference}?email=${studentEmail}`);
  assert.equal(receipt.status, 200);
  const adminToken = await login("admin", adminEmail);
  const paid = await api(server.baseUrl, `/api/admin/orders/${checkout.body.data.order.id}`, {
    method: "PATCH", token: adminToken, body: JSON.stringify({ estado: "Pagado", motivo: "Pago manual verificado" }),
  });
  assert.equal(paid.status, 200);
  const enrollment = await repositories.enrollments.findById(checkout.body.data.enrollment.id);
  assert.equal(enrollment?.status, "Activo");
  const events = await api<{ data: { actorId?: string; reason: string; previousStatus: string; nextStatus: string }[] }>(
    server.baseUrl, `/api/admin/orders/${checkout.body.data.order.id}/events`, { token: adminToken },
  );
  assert.equal(events.status, 200);
  assert.equal(events.body.data.length, 1);
  assert.equal(events.body.data[0]?.reason, "Pago manual verificado");
  assert.equal(events.body.data[0]?.previousStatus, "Pendiente");
  assert.equal(events.body.data[0]?.nextStatus, "Pagado");
  assert.equal(events.body.data[0]?.actorId, (await repositories.users.findByEmail(adminEmail))?.id);
  assert.equal((await api(server.baseUrl, `/api/admin/orders/${checkout.body.data.order.id}`, {
    method: "PATCH", token: adminToken,
    body: JSON.stringify({ estado: "Reembolsado" }),
  })).status, 400);
  assert.equal((await api(server.baseUrl, `/api/admin/orders/${checkout.body.data.order.id}`, {
    method: "PATCH", token: adminToken,
    body: JSON.stringify({ estado: "Pendiente", motivo: "Intento de reversión inválida" }),
  })).status, 400);
});

test("admin can create professors but never students", async () => {
  const token = await login("admin", adminEmail);
  const missing = await api(server.baseUrl, "/api/admin/users", { method: "POST", token, body: JSON.stringify({
    role: "profesor", name: "Another Professor", email: "another-professor@example.test",
  }) });
  assert.equal(missing.status, 400);
  const created = await api(server.baseUrl, "/api/admin/users", { method: "POST", token, body: JSON.stringify({
    role: "profesor", name: "Another Professor", email: "another-professor@example.test", password,
  }) });
  assert.equal(created.status, 201);
  const studentByHand = await api(server.baseUrl, "/api/admin/users", { method: "POST", token, body: JSON.stringify({
    role: "alumno", name: "Manual Student", email: "manual-student@example.test", password,
  }) });
  assert.equal(studentByHand.status, 400);
  const student = await repositories.users.findByEmail(studentEmail);
  assert.ok(student);
  const emailChange = await api(server.baseUrl, `/api/admin/users/${student.id}`, {
    method: "PATCH", token, body: JSON.stringify({ email: "renamed@example.test" }),
  });
  assert.equal(emailChange.status, 400);
});

test("contact form validates and stores messages", async () => {
  const response = await api(server.baseUrl, "/api/contact", { method: "POST", body: JSON.stringify({
    name: "Test Contact", email: "contact@example.test", message: "A complete test inquiry for the team.",
  }) });
  assert.equal(response.status, 201);
  assert.equal((response.body as { data: { message: string } }).data.message.includes("48 horas"), false);
  assert.equal((await repositories.contacts.list()).length, 1);
});

test("only admins can read paginated contact messages", async () => {
  const teacherToken = await login("profesor", teacherEmail);
  assert.equal((await api(server.baseUrl, "/api/admin/contacts")).status, 401);
  assert.equal((await api(server.baseUrl, "/api/admin/contacts", { token: teacherToken })).status, 403);

  const first = await repositories.contacts.create({
    id: "ctc_public_test_first", name: "First Contact", email: "first@example.test",
    message: "First test inquiry", createdAt: "2099-01-01T00:00:00.000Z",
  });
  const second = await repositories.contacts.create({
    id: "ctc_public_test_second", name: "Second Contact", email: "second@example.test",
    message: "Second test inquiry", createdAt: "2099-01-02T00:00:00.000Z",
  });
  const token = await login("admin", adminEmail);
  const newest = await api<{ data: { id: string }[] }>(
    server.baseUrl, "/api/admin/contacts?limit=1&offset=0", { token },
  );
  const next = await api<{ data: { id: string }[] }>(
    server.baseUrl, "/api/admin/contacts?limit=1&offset=1", { token },
  );
  assert.equal(newest.status, 200);
  assert.deepEqual(newest.body.data.map((item) => item.id), [second.id]);
  assert.deepEqual(next.body.data.map((item) => item.id), [first.id]);
});

test("contact pagination has a stable order when timestamps match", async () => {
  const createdAt = "2100-01-01T00:00:00.000Z";
  for (const id of ["ctc_same_a", "ctc_same_b"]) {
    await repositories.contacts.create({
      id, name: "Same Time", email: "same@example.test",
      message: "Contacts with equal timestamps", createdAt,
    });
  }
  const token = await login("admin", adminEmail);
  const first = await api<{ data: { id: string }[] }>(
    server.baseUrl, "/api/admin/contacts?limit=1&offset=0", { token },
  );
  const second = await api<{ data: { id: string }[] }>(
    server.baseUrl, "/api/admin/contacts?limit=1&offset=1", { token },
  );
  assert.deepEqual(first.body.data.map(({ id }) => id), ["ctc_same_b"]);
  assert.deepEqual(second.body.data.map(({ id }) => id), ["ctc_same_a"]);
});

test("contact requests are limited to ten per ten-minute window", async () => {
  const isolatedServer = await startTestServer();
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await api(isolatedServer.baseUrl, "/api/contact", {
        method: "POST", body: JSON.stringify({ name: "x" }),
      });
      assert.equal(response.status, 400);
    }
    const limited = await api(isolatedServer.baseUrl, "/api/contact", {
      method: "POST", body: JSON.stringify({ name: "x" }),
    });
    assert.equal(limited.status, 429);
  } finally {
    await isolatedServer.close();
  }
});

test("teacher can create and edit launched lesson content without deleting it", async () => {
  const token = await login("profesor", teacherEmail);
  const invalidPreview = await api(server.baseUrl, "/api/teacher/youtube-preview?url=https%3A%2F%2Fexample.test%2Fwatch%3Fv%3DjPTpya17tI0", { token });
  assert.equal(invalidPreview.status, 400);
  const added = await api<{ data: { id: number; lessons: { id: string }[] }[] }>(
    server.baseUrl, `/api/teacher/courses/${courseId}/modules`, {
      method: "POST", token, body: JSON.stringify({ title: "Editable module" }),
    },
  );
  assert.equal(added.status, 201);
  const moduleId = added.body.data.at(-1)?.id;
  assert.ok(moduleId);
  const lesson = await api<{ data: { id: number; lessons: { id: string }[] }[] }>(
    server.baseUrl, `/api/teacher/courses/${courseId}/modules/${moduleId}/lessons`, {
      method: "POST", token, body: JSON.stringify({
        title: "Editable lesson", type: "doc", content: [{ id: "block_test", type: "paragraph", content: "Test content" }],
      }),
    },
  );
  assert.equal(lesson.status, 201);
  const lessonId = lesson.body.data.find((module) => module.id === moduleId)?.lessons[0]?.id;
  assert.ok(lessonId);
  const edited = await api<{ data: { id: number; lessons: { id: string; document?: { blocks: unknown[] } }[] }[] }>(server.baseUrl, `/api/teacher/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`, {
    method: "PATCH", token, body: JSON.stringify({ title: "Updated lesson", content: [], document: {
      version: 1,
      blocks: [
        { id: "rich-1", type: "paragraph", props: {}, content: [{ type: "text", text: "Important", styles: { bold: true, textColor: "red" } }], children: [] },
        { id: "rich-2", type: "youtube", props: { videoId: "dQw4w9WgXcQ" }, children: [] },
      ],
    } }),
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.find((module) => module.id === moduleId)?.lessons[0]?.document?.blocks.length, 2);
  const reopened = await api<{ data: { modules: { id: number; lessons: { id: string; document?: { blocks: unknown[] } }[] }[] } }>(server.baseUrl, `/api/teacher/courses/${courseId}`, { token });
  assert.equal(reopened.body.data.modules.find((module) => module.id === moduleId)?.lessons[0]?.document?.blocks.length, 2);
  const stored = await repositories.courses.findById(courseId);
  const richLesson = stored?.modules.find((module) => module.id === moduleId)?.lessons.find((item) => item.id === lessonId);
  assert.equal(richLesson?.document?.blocks.length, 2);
  assert.equal((richLesson?.document?.blocks[0]?.content as { styles: { bold: boolean } }[])[0]?.styles.bold, true);
  const oversized = await api(server.baseUrl, `/api/teacher/courses/${courseId}/modules/${moduleId}/lessons`, {
    method: "POST", token, body: JSON.stringify({
      title: "Oversized lesson", type: "doc", content: [{ id: "big", type: "paragraph", content: "x".repeat(20_001) }],
    }),
  });
  assert.equal(oversized.status, 400);
  const rejected = await api(server.baseUrl, `/api/teacher/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`, {
    method: "PATCH", token, body: JSON.stringify({ document: { version: 1, blocks: [{ id: "bad", type: "file", props: { url: "javascript:alert(1)" } }] } }),
  });
  assert.equal(rejected.status, 400);
  const imageBlock = (url: string) => ({ version: 1, blocks: [{ id: "image-test", type: "image", props: { url }, children: [] }] });
  const externalImage = await api(server.baseUrl, `/api/teacher/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`, {
    method: "PATCH", token, body: JSON.stringify({ document: imageBlock("https://example.test/image.jpg") }),
  });
  assert.equal(externalImage.status, 400);
  const managedImage = await api(server.baseUrl, `/api/teacher/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`, {
    method: "PATCH", token, body: JSON.stringify({ document: imageBlock("https://res.cloudinary.com/test-cloud/image/upload/v1/Rozenblum/lessons/image.jpg") }),
  });
  assert.equal(managedImage.status, 200);
  const removed = await api(server.baseUrl, `/api/teacher/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`, {
    method: "DELETE", token,
  });
  assert.equal(removed.status, 400);
});

test("a stale lesson edit returns 409, preserves the winner, and can be retried", async () => {
  const course = await repositories.courses.create({
    title: "Concurrent Lesson Test", description: "Isolated revision conflict test",
    priceCents: 50_000, duration: "Online", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail,
    status: "draft", img: "https://example.test/concurrent.jpg",
  });
  const moduleId = 9901;
  const lessonId = "1.1";
  const initialModules = [{
    id: moduleId, title: "Module", position: 0,
    lessons: [{ id: lessonId, title: "Original", type: "doc" as const, position: 0, content: [] }],
  }];
  await repositories.courses.saveModules(course.legacyId, initialModules, 0);
  const originalSave = repositories.courses.saveModules.bind(repositories.courses);
  let injected = false;
  repositories.courses.saveModules = async (id, modules, revision, nextLessonNumber) => {
    if (id === course.legacyId && !injected) {
      injected = true;
      const winner = structuredClone(modules);
      winner[0]!.lessons[0]!.title = "Concurrent winner";
      assert.ok(await originalSave(id, winner, revision));
    }
    return originalSave(id, modules, revision, nextLessonNumber);
  };
  const token = await login("profesor", teacherEmail);
  const path = `/api/teacher/courses/${course.legacyId}/modules/${moduleId}/lessons/${lessonId}`;
  try {
    const stale = await api<{ error: { code: string } }>(server.baseUrl, path, {
      method: "PATCH", token, body: JSON.stringify({ title: "Stale loser" }),
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, "CONFLICT");
  } finally {
    repositories.courses.saveModules = originalSave;
  }
  const winner = await repositories.courses.findById(course.legacyId);
  assert.equal(winner?.modules[0]?.lessons[0]?.title, "Concurrent winner");
  const retried = await api(server.baseUrl, path, {
    method: "PATCH", token, body: JSON.stringify({ title: "Retried edit" }),
  });
  assert.equal(retried.status, 200);
  assert.equal((await repositories.courses.findById(course.legacyId))?.modules[0]?.lessons[0]?.title, "Retried edit");
  await repositories.courses.delete(course.legacyId, (await repositories.courses.findById(course.legacyId))!.revision ?? 0);
});

test("draft lessons keep unique IDs and launched courses cannot be deleted", async () => {
  const image = "https://res.cloudinary.com/test-cloud/image/upload/v1/Rozenblum/courses/academic.jpg";
  const course = await repositories.courses.create({
    title: "Academic Lifecycle", description: "Draft deletion and launch protection",
    priceCents: 60_000, duration: "Online", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail, status: "draft", img: image,
  });
  const teacherToken = await login("profesor", teacherEmail);
  const adminToken = await login("admin", adminEmail);
  const base = `/api/teacher/courses/${course.legacyId}`;
  const addModule = (title: string) => api<{ data: { id: number }[] }>(server.baseUrl, `${base}/modules`, {
    method: "POST", token: teacherToken, body: JSON.stringify({ title }),
  });
  const firstModule = (await addModule("First")).body.data.at(-1)!.id;
  assert.equal(await repositories.courses.delete(course.legacyId, 0), false);
  assert.equal((await repositories.courses.findById(course.legacyId))?.modules[0]?.createdBy, (await repositories.users.findByEmail(teacherEmail))?.id);
  assert.equal((await api(server.baseUrl, `${base}/modules/999999`, {
    method: "PATCH", token: teacherToken, body: JSON.stringify({ title: "Missing" }),
  })).status, 404);
  const secondModule = (await addModule("Second")).body.data.at(-1)!.id;
  const addLesson = (moduleId: number, title: string) => api<{
    data: { id: number; lessons: { id: string }[] }[]
  }>(server.baseUrl, `${base}/modules/${moduleId}/lessons`, {
    method: "POST", token: teacherToken, body: JSON.stringify({ title, type: "doc" }),
  });
  const firstId = (await addLesson(firstModule, "Deleted draft")).body.data
    .find(({ id }) => id === firstModule)!.lessons.at(-1)!.id;
  assert.equal((await repositories.courses.findById(course.legacyId))?.modules[0]?.lessons[0]?.createdBy, (await repositories.users.findByEmail(teacherEmail))?.id);
  assert.equal((await api(server.baseUrl, `${base}/modules/${firstModule}/lessons/${firstId}`, {
    method: "DELETE", token: teacherToken,
  })).status, 200);
  assert.equal((await api(server.baseUrl, `${base}/modules/${firstModule}/lessons/${firstId}`, {
    method: "DELETE", token: teacherToken,
  })).status, 404);
  const replacementId = (await addLesson(firstModule, "Replacement draft")).body.data
    .find(({ id }) => id === firstModule)!.lessons.at(-1)!.id;
  assert.notEqual(replacementId, firstId);
  assert.equal((await api(server.baseUrl, `${base}/modules/reorder`, {
    method: "PUT", token: teacherToken, body: JSON.stringify({ ids: [secondModule, firstModule] }),
  })).status, 200);
  const reorderedId = (await addLesson(secondModule, "After reorder")).body.data
    .find(({ id }) => id === secondModule)!.lessons.at(-1)!.id;
  assert.equal(new Set([firstId, replacementId, reorderedId]).size, 3);
  assert.equal((await api(server.baseUrl, `${base}/modules/${firstModule}`, {
    method: "DELETE", token: teacherToken,
  })).status, 200);

  const publish = await api(server.baseUrl, `/api/admin/courses/${course.legacyId}`, {
    method: "PATCH", token: adminToken, body: JSON.stringify({ status: "published" }),
  });
  assert.equal(publish.status, 200);
  assert.equal((await api(server.baseUrl, `${base}/modules/${secondModule}/lessons/${reorderedId}`, {
    method: "DELETE", token: teacherToken,
  })).status, 400);
  assert.equal((await api(server.baseUrl, `${base}/modules/${secondModule}`, {
    method: "DELETE", token: teacherToken,
  })).status, 400);
  assert.equal((await api(server.baseUrl, `/api/admin/courses/${course.legacyId}`, {
    method: "DELETE", token: adminToken,
  })).status, 400);
  assert.equal((await api(server.baseUrl, `/api/admin/courses/${course.legacyId}`, {
    method: "PATCH", token: adminToken, body: JSON.stringify({ status: "draft" }),
  })).status, 200);
  assert.equal((await api(server.baseUrl, `${base}/modules/${secondModule}/lessons/${reorderedId}`, {
    method: "DELETE", token: teacherToken,
  })).status, 400);
  assert.equal((await api(server.baseUrl, `${base}/modules/${secondModule}/lessons/${reorderedId}`, {
    method: "PATCH", token: teacherToken, body: JSON.stringify({ title: "Edited after launch" }),
  })).status, 200);
  const edited = (await repositories.courses.findById(course.legacyId))?.modules[0]?.lessons[0];
  assert.equal(edited?.updatedBy, (await repositories.users.findByEmail(teacherEmail))?.id);
  assert.ok(edited?.updatedAt);
  await repositories.courses.delete(course.legacyId, (await repositories.courses.findById(course.legacyId))!.revision ?? 0);
});

test("YouTube URL parsing only accepts known video hosts and IDs", () => {
  assert.equal(parseYouTubeId("https://youtu.be/jPTpya17tI0"), "jPTpya17tI0");
  assert.equal(parseYouTubeId("https://www.youtube.com/watch?v=jPTpya17tI0"), "jPTpya17tI0");
  assert.equal(parseYouTubeId("https://youtube.com.evil.test/watch?v=jPTpya17tI0"), null);
  assert.equal(parseYouTubeId("file:///watch?v=jPTpya17tI0"), null);
});

test("student and teacher can exchange messages on an active enrollment", async () => {
  const studentToken = await login("alumno", studentEmail);
  const teacherToken = await login("profesor", teacherEmail);
  const sent = await api<{ data: { text: string }[] }>(
    server.baseUrl, `/api/student/enrollments/${enrollmentId}/messages`, {
      method: "POST", token: studentToken, body: JSON.stringify({ text: "Test question" }),
    },
  );
  assert.equal(sent.status, 201);
  assert.equal(sent.body.data.at(-1)?.text, "Test question");
  const conversations = await api<{ data: { id: string }[] }>(server.baseUrl, "/api/teacher/conversations", { token: teacherToken });
  assert.equal(conversations.status, 200);
  const conversationId = conversations.body.data[0]?.id;
  assert.ok(conversationId);
  const reply = await api(server.baseUrl, `/api/teacher/conversations/${conversationId}/messages`, {
    method: "POST", token: teacherToken, body: JSON.stringify({ text: "Test answer" }),
  });
  assert.equal(reply.status, 201);
});

test("admin settings and paginated lists use repository data", async () => {
  const token = await login("admin", adminEmail);
  const saved = await api(server.baseUrl, "/api/admin/settings", { method: "PUT", token, body: JSON.stringify({
    companyName: "Updated Test Company", supportEmail: "support@example.test",
    contactWhatsapp: "5491112345678", logoUrl: "", privacyText: "Updated test privacy policy text.",
  }) });
  assert.equal(saved.status, 200);
  const publicSettings = await api<{ data: { companyName: string } }>(server.baseUrl, "/api/settings");
  assert.equal(publicSettings.body.data.companyName, "Updated Test Company");
  const users = await api<{ data: Record<string, unknown>[] }>(server.baseUrl, "/api/admin/users?role=alumno&limit=1&offset=0", { token });
  assert.equal(users.status, 200);
  assert.equal(users.body.data.length, 1);
  assert.equal("passwordHash" in users.body.data[0], false);
  assert.equal("dni" in users.body.data[0], false);
});

test("admin branding changes are visible through the public home endpoint", async () => {
  const token = await login("admin", adminEmail);
  const heroImage = "https://res.cloudinary.com/test-cloud/image/upload/v1/Rozenblum/brand/new-hero.jpg";
  const updated = await api<{ data: { brand: { heroImage: string } } }>(
    server.baseUrl, "/api/admin/content/home/images", {
      method: "PUT", token, body: JSON.stringify({ heroImage }),
    },
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.brand.heroImage, heroImage);
  const publicHome = await api<{ data: { brand: { heroImage: string } } }>(
    server.baseUrl, "/api/content/home",
  );
  assert.equal(publicHome.body.data.brand.heroImage, heroImage);
});

test("checkout waits for payment, then creates the student with the DNI password", async () => {
  const token = await login("admin", adminEmail);
  const course = (await repositories.courses.listPublished()).find((item) => item.legacyId !== courseId);
  assert.ok(course);
  const buyerDni = "28999888";
  const created = await api<{ data: { order: { id: string }; enrollment: { id: string } } }>(
    server.baseUrl, "/api/checkout", { method: "POST", body: JSON.stringify({
      courseSlug: course.slug, nombre: "Another buyer", email: "buyer@example.test", dni: buyerDni,
    }) },
  );
  assert.equal(created.status, 201);
  assert.equal(await repositories.users.findByEmail("buyer@example.test"), null);
  const pendingOrder = await repositories.orders.findByReference(created.body.data.order.id);
  assert.ok(pendingOrder?.dniPasswordHash);
  assert.notEqual(pendingOrder.dniPasswordHash, buyerDni);
  assert.equal(await verifyPassword(buyerDni, pendingOrder.dniPasswordHash), true);
  assert.equal(JSON.stringify(pendingOrder).includes(buyerDni), false);
  assert.equal(JSON.stringify(created.body).includes(pendingOrder.dniPasswordHash), false);

  const paid = await api(server.baseUrl, `/api/admin/orders/${pendingOrder?.externalReference ?? created.body.data.order.id}`, {
    method: "PATCH", token, body: JSON.stringify({ estado: "Pagado", motivo: "Transferencia confirmada" }),
  });
  assert.equal(paid.status, 200);
  const newStudent = await repositories.users.findByEmail("buyer@example.test");
  assert.equal(newStudent?.role, "alumno");
  assert.equal(JSON.stringify(newStudent).includes(buyerDni), false);
  assert.equal(newStudent?.sessionVersion, 0);
  assert.ok(newStudent && (await verifyPassword(buyerDni, newStudent.passwordHash)));

  const enrolled = await repositories.enrollments.findById(created.body.data.enrollment.id);
  assert.equal(enrolled?.status, "Activo");

  const revoked = await api(server.baseUrl, `/api/admin/orders/${created.body.data.order.id}`, {
    method: "PATCH", token, body: JSON.stringify({ estado: "Reembolsado", motivo: "Devolución acordada" }),
  });
  assert.equal(revoked.status, 200);
  assert.equal((await repositories.enrollments.findById(created.body.data.enrollment.id))?.status, "Revocado");
});

test("roles and enrollment ownership are enforced on every private flow", async () => {
  const studentToken = await login("alumno", studentEmail);
  const teacherToken = await login("profesor", teacherEmail);
  const adminToken = await login("admin", adminEmail);
  assert.equal((await api(server.baseUrl, "/api/student/enrollments")).status, 401);
  assert.equal((await api(server.baseUrl, "/api/admin/overview", { token: studentToken })).status, 403);
  assert.equal((await api(server.baseUrl, "/api/admin/users?role=alumno", { token: teacherToken })).status, 403);
  assert.equal((await api(server.baseUrl, "/api/student/enrollments", { token: adminToken })).status, 403);
  assert.equal((await api(server.baseUrl, `/api/teacher/courses/${courseId}`, { token: studentToken })).status, 403);

  const other = await repositories.users.create({
    name: "Other Student", email: "other-student@example.test", role: "alumno",
    initials: "OS", passwordHash: await hashPassword(password),
  });
  const otherEnrollment = await repositories.enrollments.create({
    studentEmail: other.email, studentName: other.name, courseId, status: "Activo",
  });
  assert.equal((await api(server.baseUrl, `/api/student/enrollments/${otherEnrollment.id}`, { token: studentToken })).status, 403);
  assert.equal((await api(server.baseUrl, `/api/student/enrollments/${otherEnrollment.id}/messages`, { token: studentToken })).status, 403);
  assert.equal((await api(server.baseUrl, `/api/student/enrollments/${otherEnrollment.id}/progress`, {
    method: "PATCH", token: studentToken, body: JSON.stringify({ lessonId: "1.1", completed: true }),
  })).status, 403);
});

test("text fields, prices, IDs and lesson blocks reject invalid boundaries", async () => {
  const teacherToken = await login("profesor", teacherEmail);
  const adminToken = await login("admin", adminEmail);
  const cases: { path: string; method: string; body: unknown; token?: string }[] = [
    { path: "/api/contact", method: "POST", body: { name: "Jo", email: "valid@example.test", message: "A complete message" } },
    { path: "/api/contact", method: "POST", body: { name: "Valid Name", email: "bad-email", message: "A complete message" } },
    { path: "/api/contact", method: "POST", body: { name: "Valid Name", email: "valid@example.test", message: "too short" } },
    { path: "/api/checkout", method: "POST", body: { courseSlug: "test-course", nombre: "Jo", email: "buyer@example.test", dni: "123" } },
    { path: `/api/teacher/courses/${courseId}/modules`, method: "POST", token: teacherToken, body: { title: "x".repeat(181) } },
    { path: `/api/teacher/courses/${courseId}/modules/1/lessons`, method: "POST", token: teacherToken, body: { title: " ", type: "doc" } },
    { path: `/api/teacher/courses/${courseId}/modules/1/lessons`, method: "POST", token: teacherToken, body: { title: "Bad link", type: "doc", content: [{ id: "bad", type: "link", content: "javascript:alert(1)" }] } },
    { path: `/api/teacher/courses/${courseId}/modules/1/lessons/reorder`, method: "PUT", token: teacherToken, body: { ids: [] } },
    { path: "/api/admin/courses", method: "POST", token: adminToken, body: { title: "Valid title", description: "Valid description", priceCents: -1, professorEmail: teacherEmail, duration: "Online", level: "Inicial" } },
    { path: "/api/admin/courses", method: "POST", token: adminToken, body: { title: "Valid title", description: "Valid description", priceCents: 1000, professorEmail: teacherEmail, duration: "Online", level: "Inicial", img: "data:image/png;base64,AAAA" } },
    { path: "/api/admin/users", method: "POST", token: adminToken, body: { role: "profesor", name: "New Professor", email: "new@example.test", password: "short" } },
    { path: "/api/admin/settings", method: "PUT", token: adminToken, body: { companyName: "Test Company", supportEmail: "support@example.test", contactWhatsapp: "abc", logoUrl: "", privacyText: "A complete privacy policy" } },
    { path: "/api/admin/settings", method: "PUT", token: adminToken, body: { companyName: "Test Company", supportEmail: "support@example.test", contactWhatsapp: "5491112345678", logoUrl: "javascript:alert(1)", privacyText: "A complete privacy policy" } },
    { path: "/api/admin/orders/unknown", method: "PATCH", token: adminToken, body: { estado: "Unknown" } },
  ];
  for (const item of cases) {
    const response = await api(server.baseUrl, item.path, { method: item.method, token: item.token, body: JSON.stringify(item.body) });
    assert.equal(response.status, 400, `${item.method} ${item.path}`);
  }
});

test("course creation requires selecting an active registered professor", async () => {
  const adminToken = await login("admin", adminEmail);
  const input = {
    title: "Professor Assignment Course", description: "Requires a real professor account",
    priceCents: 100_000, duration: "Online", level: "Inicial", status: "draft",
  };
  for (const professorEmail of [undefined, "missing@example.test", adminEmail]) {
    const response = await api(server.baseUrl, "/api/admin/courses", {
      method: "POST", token: adminToken,
      body: JSON.stringify({ ...input, professorEmail }),
    });
    assert.equal(response.status, 400);
  }
  const inactive = await repositories.users.create({
    name: "Inactive Professor", email: "inactive-professor@example.test", role: "profesor",
    status: "Suspendido", initials: "IP", passwordHash: await hashPassword(password),
  });
  const suspended = await api(server.baseUrl, "/api/admin/courses", {
    method: "POST", token: adminToken,
    body: JSON.stringify({ ...input, professorEmail: inactive.email }),
  });
  assert.equal(suspended.status, 400);
  const created = await api<{ data: { id: number; professor: string; professorId: string; status: string } }>(
    server.baseUrl, "/api/admin/courses", {
      method: "POST", token: adminToken,
      body: JSON.stringify({ ...input, professorEmail: teacherEmail }),
    },
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.data.professorId, teacherEmail);
  assert.equal(created.body.data.status, "draft");
  assert.equal((await repositories.courses.findById(created.body.data.id))?.professorEmail, teacherEmail);
  const premature = await api(server.baseUrl, "/api/admin/courses", {
    method: "POST", token: adminToken,
    body: JSON.stringify({ ...input, professorEmail: teacherEmail, status: "published" }),
  });
  assert.equal(premature.status, 400);
});

test("checkout rejects a course whose professor is no longer available without creating records", async () => {
  const course = await repositories.courses.create({
    title: "Unavailable Professor Course", description: "No active professor account",
    priceCents: 100_000, duration: "Online", level: "Inicial",
    img: "https://example.test/unavailable.jpg", professor: "Missing Professor",
    professorEmail: "missing-professor@example.test", status: "published",
  });
  const orderCount = (await repositories.orders.list()).length;
  const enrollmentCount = (await repositories.enrollments.listAll()).length;
  const response = await api(server.baseUrl, "/api/checkout", {
    method: "POST", body: JSON.stringify({
      courseSlug: course.slug, nombre: "Another Buyer", email: "unavailable-buyer@example.test",
      dni: "28999888",
    }),
  });
  assert.equal(response.status, 404);
  assert.equal((await repositories.orders.list()).length, orderCount);
  assert.equal((await repositories.enrollments.listAll()).length, enrollmentCount);
});

test("empty courses cannot be published or sold, and related records block deletion", async () => {
  const adminToken = await login("admin", adminEmail);
  const teacherToken = await login("profesor", teacherEmail);
  const created = await api<{ data: { id: number; slug: string } }>(server.baseUrl, "/api/admin/courses", {
    method: "POST", token: adminToken, body: JSON.stringify({
      title: "Boundary Course", description: "A course for publication boundaries", priceCents: 123_400,
      professorEmail: teacherEmail, duration: "Two weeks", level: "Inicial", status: "draft",
    }),
  });
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  assert.equal((await api(server.baseUrl, `/api/admin/courses/${id}`, { method: "PATCH", token: adminToken, body: JSON.stringify({ status: "published" }) })).status, 400);
  assert.equal((await api(server.baseUrl, `/api/courses/${created.body.data.slug}`)).status, 404);
  const modules = await api<{ data: { id: number }[] }>(server.baseUrl, `/api/teacher/courses/${id}/modules`, {
    method: "POST", token: teacherToken, body: JSON.stringify({ title: "First module" }),
  });
  const moduleId = modules.body.data[0]?.id;
  assert.ok(moduleId);
  assert.equal((await api(server.baseUrl, `/api/teacher/courses/${id}/modules/${moduleId}/lessons`, {
    method: "POST", token: teacherToken, body: JSON.stringify({ title: "First lesson", type: "doc" }),
  })).status, 201);
  assert.equal((await api(server.baseUrl, `/api/admin/courses/${id}`, { method: "PATCH", token: adminToken, body: JSON.stringify({ status: "published" }) })).status, 400);
  assert.equal((await api(server.baseUrl, `/api/admin/courses/${id}`, { method: "PATCH", token: adminToken, body: JSON.stringify({ status: "published", img: "https://example.test/course.jpg" }) })).status, 400);
  assert.equal((await api(server.baseUrl, `/api/admin/courses/${id}`, { method: "PATCH", token: adminToken, body: JSON.stringify({ status: "published", img: "https://res.cloudinary.com/test-cloud/image/upload/v1/Rozenblum/courses/cover.jpg", priceCents: 250_000, duration: "Three weeks", level: "Intermedio" }) })).status, 200);
  const updated = await repositories.courses.findById(id);
  assert.equal(updated?.price.replaceAll("\u00a0", " "), "$ 2.500");
  assert.equal(updated?.duration, "Three weeks");
  assert.equal((await api(server.baseUrl, `/api/teacher/courses/${id}/modules/${moduleId}/lessons/1.1`, { method: "DELETE", token: teacherToken })).status, 400);
  const order = await api(server.baseUrl, "/api/checkout", { method: "POST", body: JSON.stringify({
    courseSlug: created.body.data.slug, nombre: "Boundary Buyer", email: "boundary-buyer@example.test", dni: "25555666",
  }) });
  assert.equal(order.status, 201);
  assert.equal((await api(server.baseUrl, `/api/admin/courses/${id}`, { method: "DELETE", token: adminToken })).status, 400);
  const teacher = await repositories.users.findByEmail(teacherEmail);
  assert.ok(teacher);
  assert.equal((await api(server.baseUrl, `/api/admin/users/${teacher.id}`, { method: "DELETE", token: adminToken })).status, 400);
});

test("order lookup protects other buyers and invalid pagination uses safe defaults", async () => {
  const adminToken = await login("admin", adminEmail);
  const order = (await repositories.orders.list()).find((item) => item.externalReference);
  assert.ok(order);
  assert.equal((await api(server.baseUrl, `/api/orders/${order.externalReference}?email=wrong@example.test`)).status, 404);
  for (const query of ["limit=0", "limit=1001", "offset=-1", "offset=abc"]) {
    assert.equal((await api(server.baseUrl, `/api/admin/enrollments?${query}`, { token: adminToken })).status, 200);
  }
});

test("suspended accounts and revoked tokens cannot access private routes", async () => {
  const adminToken = await login("admin", adminEmail);
  const suspendPassword = "suspend-password-123";
  const user = await repositories.users.create({
    name: "Suspend Me", email: "suspend-me@example.test", role: "alumno",
    initials: "SM", passwordHash: await hashPassword(suspendPassword),
  });

  const initial = await rawLogin("alumno", user.email, suspendPassword);
  assert.equal(initial.status, 200);
  const token = initial.body.data!.token;
  assert.equal((await api(server.baseUrl, "/api/student/enrollments", { token })).status, 200);

  assert.equal((await api(server.baseUrl, `/api/admin/users/${user.id}`, {
    method: "PATCH", token: adminToken, body: JSON.stringify({ status: "Suspendido" }),
  })).status, 200);
  assert.equal((await api(server.baseUrl, "/api/auth/session", { token })).status, 401);
  assert.equal((await rawLogin("alumno", user.email, suspendPassword)).status, 401);

  assert.equal((await api(server.baseUrl, `/api/admin/users/${user.id}`, {
    method: "PATCH", token: adminToken, body: JSON.stringify({ status: "Activo" }),
  })).status, 200);
  // Reactivating does not resurrect tokens issued before the suspension.
  assert.equal((await api(server.baseUrl, "/api/auth/session", { token })).status, 401);
  assert.equal((await rawLogin("alumno", user.email, suspendPassword)).status, 200);

  assert.equal((await api(server.baseUrl, "/api/auth/session", { token: "invalid.token" })).status, 401);
});

test("changing a staff password revokes previous sessions", async () => {
  const adminToken = await login("admin", adminEmail);
  const originalPassword = "staff-password-12345";
  const nextPassword = "staff-password-67890";
  const user = await repositories.users.create({
    name: "Revocable Professor", email: "revocable-professor@example.test", role: "profesor",
    initials: "RP", passwordHash: await hashPassword(originalPassword),
  });

  const first = await rawLogin("profesor", user.email, originalPassword);
  assert.equal(first.status, 200);
  const token = first.body.data!.token;
  assert.equal((await api(server.baseUrl, "/api/auth/session", { token })).status, 200);

  const changed = await api(server.baseUrl, `/api/admin/users/${user.id}`, {
    method: "PATCH", token: adminToken, body: JSON.stringify({ password: nextPassword }),
  });
  assert.equal(changed.status, 200);
  assert.equal((await api(server.baseUrl, "/api/auth/session", { token })).status, 401);
  assert.equal((await rawLogin("profesor", user.email, originalPassword)).status, 401);
  assert.equal((await rawLogin("profesor", user.email, nextPassword)).status, 200);
});

test("concurrent password changes increment the session version atomically", async () => {
  const user = await repositories.users.create({
    name: "Concurrent Professor", email: "concurrent-professor@example.test", role: "profesor",
    initials: "CP", passwordHash: await hashPassword(password),
  });
  const adminToken = await login("admin", adminEmail);
  const responses = await Promise.all(["concurrent-password-1", "concurrent-password-2"].map(
    (candidate) => api(server.baseUrl, `/api/admin/users/${user.id}`, {
      method: "PATCH", token: adminToken, body: JSON.stringify({ password: candidate }),
    }),
  ));
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal((await repositories.users.findById(user.id))?.sessionVersion, 2);
});

test("users can change their own password and receive a fresh session", async () => {
  const initialPassword = "initial-password-123";
  const nextPassword = "brand-new-password-456";
  const user = await repositories.users.create({
    name: "Self Changer",
    email: "self-changer@example.test",
    role: "profesor",
    initials: "SC",
    passwordHash: await hashPassword(initialPassword),
  });

  const first = await loginService({ role: "profesor", email: user.email, password: initialPassword });
  const oldToken = first.token;

  const wrongCurrent = await api(server.baseUrl, "/api/auth/password", {
    method: "POST",
    token: oldToken,
    body: JSON.stringify({ currentPassword: "not-the-password", newPassword: nextPassword }),
  });
  assert.equal(wrongCurrent.status, 400);

  const changed = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/password", {
    method: "POST",
    token: oldToken,
    body: JSON.stringify({ currentPassword: initialPassword, newPassword: nextPassword }),
  });
  assert.equal(changed.status, 200);
  const freshToken = changed.body.data.token;
  assert.notEqual(freshToken, oldToken);

  // The change revokes the token used for the request, but the returned token
  // keeps the user working without forcing a new login.
  assert.equal((await api(server.baseUrl, "/api/auth/session", { token: oldToken })).status, 401);
  assert.equal((await api(server.baseUrl, "/api/auth/session", { token: freshToken })).status, 200);
  await assert.rejects(
    loginService({ role: "profesor", email: user.email, password: initialPassword }),
  );
  const nextSession = await loginService({ role: "profesor", email: user.email, password: nextPassword });
  assert.equal(nextSession.user.email, user.email);

  const repeated = await api(server.baseUrl, "/api/auth/password", {
    method: "POST",
    token: freshToken,
    body: JSON.stringify({ currentPassword: nextPassword, newPassword: nextPassword }),
  });
  assert.equal(repeated.status, 400);
});

test("a student can replace the DNI password with a strong one", async () => {
  const dni = "27654321";
  const nextPassword = "student-own-password-789";
  const email = "dni-rotation@example.test";
  await repositories.users.create({
    name: "DNI Rotation",
    email,
    role: "alumno",
    initials: "DR",
    passwordHash: await hashPassword(dni),
  });

  const session = await loginService({ role: "alumno", email, password: dni });
  const changed = await api(server.baseUrl, "/api/auth/password", {
    method: "POST",
    token: session.token,
    body: JSON.stringify({ currentPassword: dni, newPassword: nextPassword }),
  });
  assert.equal(changed.status, 200);
  await assert.rejects(loginService({ role: "alumno", email, password: dni }));
  const nextSession = await loginService({ role: "alumno", email, password: nextPassword });
  assert.equal(nextSession.user.email, email);

  // Buying another course after rotating the password: the DNI is no longer
  // the password, but the signed-in session proves identity.
  const extraCourse = await repositories.courses.create({
    title: "Post Rotation Course",
    description: "Course used to verify checkout after a password change.",
    priceCents: 75_000,
    duration: "On-Demand",
    level: "Inicial",
    professor: "Test profesor",
    professorEmail: teacherEmail,
    status: "published",
    img: "https://example.test/post-rotation.jpg",
  });
  await repositories.courses.saveModules(extraCourse.legacyId, [
    { id: 1, title: "Only module", position: 1, lessons: [
      { id: "1.1", title: "Only lesson", type: "doc", position: 1, content: [] },
    ] },
  ], 0);

  const body = JSON.stringify({
    courseSlug: extraCourse.slug,
    nombre: "DNI Rotation",
    email,
    dni,
  });
  const withoutSession = await api(server.baseUrl, "/api/checkout", {
    method: "POST",
    body,
  });
  assert.equal(withoutSession.status, 401);

  const withSession = await api(server.baseUrl, "/api/checkout", {
    method: "POST",
    token: nextSession.token,
    body,
  });
  assert.equal(withSession.status, 201);
});

test("error envelopes always include the request id and malformed JSON is a 400", async () => {
  const missing = await api<{ error: { requestId?: string } }>(server.baseUrl, "/api/not-a-real-route");
  assert.equal(missing.status, 404);
  assert.ok(missing.body.error.requestId);

  const invalid = await api<{ error: { code: string; requestId?: string } }>(
    server.baseUrl,
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ role: "admin", email: "not-an-email" }) },
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "BAD_REQUEST");
  assert.ok(invalid.body.error.requestId);

  const malformed = await fetch(`${server.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  const body = (await malformed.json()) as { error: { requestId?: string } };
  assert.ok(body.error.requestId);
  assert.equal(malformed.headers.get("x-request-id"), body.error.requestId);
});

test("an empty module does not lock the following modules", () => {
  const course = {
    modules: [
      { id: 1, lessons: [{ id: "1.1" }] },
      { id: 2, lessons: [] },
      { id: 3, lessons: [{ id: "3.1" }] },
    ],
  } as unknown as Parameters<typeof moduleStatuses>[0];

  const statuses = moduleStatuses(course, ["1.1"]);
  assert.equal(statuses.get(1), "completed");
  assert.equal(statuses.get(2), "locked");
  assert.equal(statuses.get(3), "in_progress");
});

test("reassigning a course professor moves its conversations", async () => {
  const adminToken = await login("admin", adminEmail);
  const newProfessor = await repositories.users.create({
    name: "Replacement Professor",
    email: "replacement-professor@example.test",
    role: "profesor",
    initials: "RP",
    passwordHash: await hashPassword(password),
  });
  const course = await repositories.courses.create({
    title: "Reassignable Course",
    description: "Course used to verify conversation reassignment.",
    priceCents: 50_000,
    duration: "On-Demand",
    level: "Inicial",
    professor: "Test profesor",
    professorEmail: teacherEmail,
    status: "draft",
    img: "https://example.test/reassign.jpg",
  });
  const conversation = await repositories.conversations.create({
    id: "cnv_reassign_test",
    courseId: course.legacyId,
    studentEmail: "reassign-student@example.test",
    studentName: "Reassign Student",
    teacherEmail,
    teacherName: "Test profesor",
    messages: [],
  });

  const updated = await api(server.baseUrl, `/api/admin/courses/${course.legacyId}`, {
    method: "PATCH",
    token: adminToken,
    body: JSON.stringify({ professorEmail: newProfessor.email }),
  });
  assert.equal(updated.status, 200);

  const moved = await repositories.conversations.findById(conversation.id);
  assert.equal(moved?.teacherEmail, newProfessor.email);
  assert.equal(moved?.teacherName, newProfessor.name);

  const newToken = (
    await loginService({ role: "profesor", email: newProfessor.email, password })
  ).token;
  const list = await api<{ data: { id: string }[] }>(server.baseUrl, "/api/teacher/conversations", {
    token: newToken,
  });
  assert.ok(list.body.data.some((item) => item.id === conversation.id));
  const former = await api(server.baseUrl, `/api/teacher/conversations/${conversation.id}/messages`, {
    method: "POST",
    token: await login("profesor", teacherEmail),
    body: JSON.stringify({ text: "Still here?" }),
  });
  assert.equal(former.status, 403);
});

test("deleting a student also removes their conversations", async () => {
  const adminToken = await login("admin", adminEmail);
  const student = await repositories.users.create({
    name: "Deletable Student",
    email: "deletable-student@example.test",
    role: "alumno",
    initials: "DS",
    passwordHash: await hashPassword("deletable-password-123"),
  });
  const enrollment = await repositories.enrollments.create({
    studentEmail: student.email,
    studentName: student.name,
    courseId,
    status: "Activo",
  });
  const conversation = await repositories.conversations.create({
    id: "cnv_deletable_test",
    courseId,
    studentEmail: student.email,
    studentName: student.name,
    teacherEmail,
    teacherName: "Test profesor",
    messages: [],
  });

  const removed = await api(server.baseUrl, `/api/admin/users/${student.id}`, {
    method: "DELETE",
    token: adminToken,
  });
  assert.equal(removed.status, 204);
  assert.equal(await repositories.users.findById(student.id), null);
  assert.equal(await repositories.enrollments.findById(enrollment.id), null);
  assert.equal(await repositories.conversations.findById(conversation.id), null);
});

test("login is rate limited after repeated invalid attempts", async () => {
  let limited = false;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const response = await api(server.baseUrl, "/api/auth/login", { method: "POST", headers: {
      "x-forwarded-for": `198.51.100.${attempt + 1}`,
    }, body: JSON.stringify({
      role: "admin", email: adminEmail, password: "invalid",
    }) });
    if (response.status === 429) limited = true;
  }
  assert.equal(limited, true);
});

test("checkout rolls back an order when enrollment persistence fails", async () => {
  const course = await repositories.courses.create({
    title: "Rollback Course", description: "Transaction failure test", priceCents: 45_000,
    duration: "Online", level: "Inicial", img: "https://example.test/rollback.jpg",
    professor: "Test profesor", professorEmail: teacherEmail, status: "published",
  });
  const originalCreate = repositories.enrollments.create.bind(repositories.enrollments);
  repositories.enrollments.create = async () => { throw new Error("Injected enrollment failure"); };
  try {
    const response = await api(server.baseUrl, "/api/checkout", {
      method: "POST", body: JSON.stringify({
        courseSlug: course.slug, nombre: "Rollback Student", email: "rollback@example.test",
        dni: "32123456", paymentMethod: "manual",
      }),
    });
    assert.equal(response.status, 500);
    assert.equal((await repositories.orders.list()).some((order) => order.email === "rollback@example.test"), false);
    assert.equal(await repositories.enrollments.findByStudentAndCourse("rollback@example.test", course.legacyId), null);
  } finally {
    repositories.enrollments.create = originalCreate;
  }
});

test("signed Mercado Pago events activate once, reject a wrong amount, and revoke on refund", async () => {
  const course = await repositories.courses.create({
    title: "Payment Course", description: "Verified gateway test", priceCents: 123_400,
    duration: "Online", level: "Inicial", img: "https://example.test/payment.jpg",
    professor: "Test profesor", professorEmail: teacherEmail, status: "published",
  });
  const secret = "test-webhook-secret-for-payment-flow";
  const paymentId = "123456789";
  let reference = "";
  let payment: PaymentSnapshot = {
    id: paymentId, externalReference: "", status: "approved", statusDetail: "accredited",
    amountCents: 123_400, currency: "ARS",
  };
  setPaymentGatewayForTests({
    async createPreference(input) {
      reference = input.reference;
      assert.equal(input.priceCents, course.priceCents);
      return { id: "pref-test", url: "https://www.mercadopago.com.ar/checkout/test" };
    },
    async getPayment(id) { return { ...payment, id, externalReference: payment.externalReference || reference }; },
  }, secret);
  try {
    assert.equal((await api(server.baseUrl, "/api/checkout", { method: "POST", body: JSON.stringify({
      courseSlug: course.slug, nombre: "Payment Student", email: "payment@example.test",
      dni: "33123456", priceCents: 1,
    }) })).status, 400);
    const checkout = await api<{ data: { order: { id: string }; payment: { url: string } } }>(
      server.baseUrl, "/api/checkout", { method: "POST", body: JSON.stringify({
        courseSlug: course.slug, nombre: "Payment Student", email: "payment@example.test",
        dni: "33123456",
      }) },
    );
    assert.equal(checkout.status, 201);
    assert.equal(checkout.body.data.payment.url, "https://www.mercadopago.com.ar/checkout/test");
    const orderId = checkout.body.data.order.id;
    assert.equal((await repositories.orders.findByReference(orderId))?.montoCents, 123_400);
    assert.equal(await repositories.users.findByEmail("payment@example.test"), null);
    const notify = async (eventId: string, signatureValid = true, requestedPaymentId = paymentId) => {
      const requestId = `request-${eventId}`;
      const ts = String(Date.now());
      const manifest = `id:${requestedPaymentId};request-id:${requestId};ts:${ts};`;
      const hash = createHmac("sha256", secret).update(manifest).digest("hex");
      return api(server.baseUrl, `/api/payments/mercadopago/webhook?data.id=${requestedPaymentId}`, {
        method: "POST", headers: {
          "x-request-id": requestId,
          "x-signature": `ts=${ts},v1=${signatureValid ? hash : "0".repeat(64)}`,
        },
        body: JSON.stringify({ id: eventId, type: "payment", data: { id: requestedPaymentId } }),
      });
    };
    assert.equal((await notify("bad-signature", false)).status, 401);
    payment = { ...payment, amountCents: 1 };
    assert.equal((await notify("bad-amount")).status, 400);
    payment = { ...payment, amountCents: 123_400, currency: "USD" };
    assert.equal((await notify("bad-currency")).status, 400);
    payment = { ...payment, currency: "ARS", externalReference: "wrong-reference" };
    assert.equal((await notify("bad-reference")).status, 404);
    assert.equal(await repositories.users.findByEmail("payment@example.test"), null);
    payment = { ...payment, externalReference: "" };
    const originalEventCreate = repositories.paymentEvents.create.bind(repositories.paymentEvents);
    repositories.paymentEvents.create = async () => { throw new Error("Injected event failure"); };
    try {
      assert.equal((await notify("approved")).status, 500);
      assert.equal((await repositories.orders.findByReference(orderId))?.estado, "Pendiente");
      assert.equal(await repositories.users.findByEmail("payment@example.test"), null);
    } finally {
      repositories.paymentEvents.create = originalEventCreate;
    }
    assert.equal((await notify("approved")).status, 200);
    assert.equal((await notify("approved")).status, 200);
    assert.equal((await repositories.orders.findByReference(orderId))?.estado, "Pagado");
    const adminToken = await login("admin", adminEmail);
    assert.equal((await api(server.baseUrl, `/api/admin/orders/${orderId}`, {
      method: "PATCH", token: adminToken,
      body: JSON.stringify({ estado: "Reembolsado", motivo: "Intento manual inválido" }),
    })).status, 400);
    assert.equal((await repositories.enrollments.findByStudentAndCourse("payment@example.test", course.legacyId))?.status, "Activo");
    assert.equal((await repositories.enrollments.listAll()).filter((item) =>
      item.studentEmail === "payment@example.test" && item.courseId === course.legacyId).length, 1);
    assert.ok(await repositories.users.findByEmail("payment@example.test"));
    assert.equal((await repositories.paymentEvents.listByOrder(orderId)).length, 1);
    payment = { ...payment, status: "in_mediation", statusDetail: "pending" };
    assert.equal((await notify("disputed")).status, 200);
    assert.equal((await repositories.orders.findByReference(orderId))?.estado, "En disputa");
    assert.equal((await repositories.enrollments.findByStudentAndCourse("payment@example.test", course.legacyId))?.status, "Revocado");
    payment = { ...payment, status: "approved", statusDetail: "accredited" };
    assert.equal((await notify("resolved-in-favor")).status, 200);
    assert.equal((await repositories.orders.findByReference(orderId))?.estado, "Pagado");
    assert.equal((await repositories.enrollments.findByStudentAndCourse("payment@example.test", course.legacyId))?.status, "Activo");
    payment = { ...payment, status: "refunded", statusDetail: "refunded" };
    assert.equal((await notify("unrelated-refund", true, "999999999")).status, 200);
    assert.equal((await repositories.orders.findByReference(orderId))?.estado, "Pagado");
    assert.equal((await notify("refunded")).status, 200);
    assert.equal((await repositories.orders.findByReference(orderId))?.estado, "Reembolsado");
    assert.equal((await repositories.enrollments.findByStudentAndCourse("payment@example.test", course.legacyId))?.status, "Revocado");
    payment = { ...payment, status: "approved", statusDetail: "accredited" };
    assert.equal((await notify("late-approved")).status, 200);
    assert.equal((await repositories.orders.findByReference(orderId))?.estado, "Reembolsado");
  } finally {
    setPaymentGatewayForTests(null);
  }
});

test("manual confirmation repairs an old order without an enrollment and audits the actor", async () => {
  const course = await repositories.courses.create({
    title: "Legacy Order Course", description: "Order recovery test", priceCents: 80_000,
    duration: "Online", level: "Inicial", img: "https://example.test/legacy-order.jpg",
    professor: "Test profesor", professorEmail: teacherEmail, status: "published",
  });
  const orderId = "ord_legacy_without_enrollment";
  await repositories.orders.create({
    id: orderId, externalReference: "RB-LEGACY-MISSING", alumno: "Legacy Buyer",
    email: "legacy-buyer@example.test", dniPasswordHash: await hashPassword("34123456"),
    curso: course.title, courseSlug: course.slug, courseId: course.legacyId,
    monto: course.price, montoCents: course.priceCents, fecha: "05/11/2026",
    metodo: "Pago manual", estado: "Pendiente", createdAt: new Date().toISOString(),
    paymentProvider: "manual",
  });
  const token = await login("admin", adminEmail);
  const result = await api(server.baseUrl, `/api/admin/orders/${orderId}`, {
    method: "PATCH", token,
    body: JSON.stringify({ estado: "Pagado", motivo: "Transferencia histórica verificada" }),
  });
  assert.equal(result.status, 200);
  assert.equal((await repositories.enrollments.findByStudentAndCourse("legacy-buyer@example.test", course.legacyId))?.status, "Activo");
  assert.equal((await repositories.users.findByEmail("legacy-buyer@example.test"))?.role, "alumno");
  assert.equal((await repositories.paymentEvents.listByOrder(orderId))[0]?.actorId,
    (await repositories.users.findByEmail(adminEmail))?.id);
});
