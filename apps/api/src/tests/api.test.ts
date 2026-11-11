import assert from "node:assert/strict";
import { createHmac, scryptSync } from "node:crypto";
import { after, before, test } from "node:test";
import { BRAND_HERO_URL, loginSchema } from "@rozenblum/shared";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { createMockRepositories } from "../repositories/mock.js";
import { setRepositoriesForTests } from "../repositories/index.js";
import { parseYouTubeId } from "../services/youtube.js";
import { login as loginService } from "../services/auth.js";
import { moduleStatuses } from "../services/mappers.js";
import { detectImageFormat, isManagedImageUrl, mediaFolder } from "../services/media.js";
import { setPaymentGatewayForTests, type PaymentSnapshot } from "../services/mercadopago.js";
import { applyOrderTransition } from "../services/order-transitions.js";
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
});

const checkoutGateway = {
  async createPreference(input: { reference: string }) {
    return { id: `pref-${input.reference}`, url: "https://www.mercadopago.com.ar/checkout/test" };
  },
  async getPayment(): Promise<PaymentSnapshot> { throw new Error("No se consultan pagos en este proveedor de prueba."); },
};

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
    body: JSON.stringify({ email, password: candidate }),
  });
  assert.equal(response.status, 200);
  sessionTokens.set(cacheKey, response.body.data.token);
  return response.body.data.token;
}

async function rawLogin(
  email: string,
  candidate: string,
) {
  return api<{ data: { token: string } | null; error?: { message: string } }>(
    server.baseUrl,
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ email, password: candidate }) },
  );
}

before(async () => {
  setRepositoriesForTests(repositories);
  setPaymentGatewayForTests(checkoutGateway);
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
  setPaymentGatewayForTests(null);
  await server?.close();
});

test("health and request IDs work without a live database in isolated tests", async () => {
  const response = await fetch(`${server.baseUrl}/health/ready`);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("x-request-id"));
});

test("login uses the stored role without requiring or trusting a client role", async () => {
  const missing = await api(server.baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: adminEmail }),
  });
  assert.equal(missing.status, 400);
  const wrong = await api(server.baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: adminEmail, password: "wrong" }),
  });
  assert.equal(wrong.status, 401);
  const unified = await api<{ data: { token: string; user: { role: string } } }>(server.baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: adminEmail, password }),
  });
  assert.equal(unified.status, 200);
  assert.equal(unified.body.data.user.role, "admin");
  assert.ok(unified.body.data.token);
  for (const [role, email, candidate] of [
    ["alumno", studentEmail, studentDni],
    ["profesor", teacherEmail, password],
    ["admin", adminEmail, password],
  ] as const) {
    const result = await loginService({ email, password: candidate });
    assert.equal(result.user.role, role);
  }
  const legacy = await api<{ data: { user: { role: string } } }>(server.baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ role: "admin", email: studentEmail, password: studentDni }),
  });
  assert.equal(legacy.status, 200);
  assert.equal(legacy.body.data.user.role, "alumno");
  assert.equal(loginSchema.safeParse({
    email: adminEmail, password: "x".repeat(129),
  }).success, false);
  const token = await login("admin", adminEmail);
  const session = await api(server.baseUrl, "/api/auth/session", { token });
  assert.equal(session.status, 200);
  for (const email of ["missing@example.test", studentEmail]) {
    await assert.rejects(
      loginService({ email, password }),
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

test("home content uses the injected repository and keeps the fixed brand without a document", async () => {
  const home = await api<{ data: { brand: { locationLabel: string; heroImage: string } } }>(
    server.baseUrl, "/api/content/home",
  );
  assert.equal(home.status, 200);
  assert.equal(home.body.data.brand.locationLabel, "Buenos Aires");
  assert.equal(home.body.data.brand.heroImage, BRAND_HERO_URL);
  assert.equal(JSON.stringify(home.body).includes("userId"), false);
  assert.equal(JSON.stringify(home.body).includes("_id"), false);

  const withoutHome = createMockRepositories();
  setRepositoriesForTests(withoutHome);
  try {
    const empty = await api<{ data: { brand: { heroImage: string }; team: unknown[] } }>(server.baseUrl, "/api/content/home");
    assert.equal(empty.status, 200);
    assert.equal(empty.body.data.brand.heroImage, BRAND_HERO_URL);
    assert.deepEqual(empty.body.data.team, []);
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
  assert.equal((await api(server.baseUrl, "/api/media/brand", { token: teacherToken })).status, 400);
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

test("expired, revoked and missing enrollments cannot reach classroom content", async () => {
  const studentToken = await login("alumno", studentEmail);
  const teacherToken = await login("profesor", teacherEmail);
  const course = await repositories.courses.create({
    title: "Blocked Classroom Course", description: "Enrollment access boundary test.",
    priceCents: 10_000, duration: "Online", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail, status: "published",
    img: "https://example.test/blocked.jpg", accessDays: 30,
  });
  await repositories.courses.saveModules(course.legacyId, [
    { id: 1, title: "Only module", position: 1, lessons: [
      { id: "1.1", title: "Private lesson", type: "doc", position: 1,
        content: [{ id: "secret", type: "paragraph", content: "Contenido privado" }] },
    ] },
  ], 0);

  const past = new Date(Date.now() - 60_000).toISOString();
  const expired = await repositories.enrollments.create({
    studentEmail, studentName: "Test alumno", courseId: course.legacyId,
    status: "Activo", expiresAt: past,
  });
  const view = () => api<{ data: {
    status: string; expiresAt?: string;
    modules: { lessons: { content?: unknown[]; document?: unknown }[] }[];
  } }>(server.baseUrl, `/api/student/enrollments/${expired.id}`, { token: studentToken });

  const expiredView = await view();
  assert.equal(expiredView.status, 200);
  assert.equal(expiredView.body.data.status, "Revocado");
  assert.equal(expiredView.body.data.expiresAt, past);
  assert.ok(expiredView.body.data.modules.every((mod) =>
    mod.lessons.every((lesson) => lesson.content?.length === 0 && !lesson.document)));
  const expiredProgress = await api(server.baseUrl, `/api/student/enrollments/${expired.id}/progress`, {
    method: "PATCH", token: studentToken, body: JSON.stringify({ lessonId: "1.1", completed: true }),
  });
  assert.equal(expiredProgress.status, 403);
  assert.equal((await api(server.baseUrl, `/api/student/enrollments/${expired.id}/messages`, {
    token: studentToken,
  })).status, 403);

  // Lifting the expiry restores access; the course content is released again.
  await repositories.enrollments.setExpiresAt(expired.id, undefined);
  const restored = await view();
  assert.equal(restored.body.data.status, "Activo");
  assert.equal(restored.body.data.modules[0]?.lessons[0]?.content?.length, 1);

  const revokedCourse = await repositories.courses.create({
    title: "Revoked Classroom Course", description: "Revoked enrollment test.",
    priceCents: 10_000, duration: "Online", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail, status: "published",
    img: "https://example.test/revoked.jpg",
  });
  const revoked = await repositories.enrollments.create({
    studentEmail, studentName: "Test alumno", courseId: revokedCourse.legacyId, status: "Revocado",
  });
  assert.equal((await api(server.baseUrl, `/api/student/enrollments/${revoked.id}/progress`, {
    method: "PATCH", token: studentToken, body: JSON.stringify({ lessonId: "1.1", completed: true }),
  })).status, 403);

  const unassigned = await repositories.courses.create({
    title: "Unassigned Classroom Course", description: "No enrollment for this student.",
    priceCents: 10_000, duration: "Online", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail, status: "published",
    img: "https://example.test/unassigned.jpg",
  });
  assert.equal((await api(server.baseUrl,
    `/api/student/enrollments/${unassigned.legacyId}`, { token: studentToken })).status, 403);

  const foreign = await repositories.courses.create({
    title: "Foreign Teacher Course", description: "Managed by another professor.",
    priceCents: 10_000, duration: "Online", level: "Inicial",
    professor: "Other Professor", professorEmail: "other-professor@example.test", status: "published",
    img: "https://example.test/foreign.jpg",
  });
  assert.equal((await api(server.baseUrl,
    `/api/teacher/courses/${foreign.legacyId}`, { token: teacherToken })).status, 403);
});

test("progress writes are idempotent and reject lessons from another course", async () => {
  const studentToken = await login("alumno", studentEmail);
  const course = await repositories.courses.create({
    title: "Idempotent Progress Course", description: "Repeated progress writes test.",
    priceCents: 10_000, duration: "Online", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail, status: "published",
    img: "https://example.test/idempotent.jpg",
  });
  await repositories.courses.saveModules(course.legacyId, [
    { id: 1, title: "First", position: 1, lessons: [
      { id: "1.1", title: "First lesson", type: "doc", position: 1, content: [] },
    ] },
    { id: 2, title: "Second", position: 2, lessons: [
      { id: "2.1", title: "Second lesson", type: "doc", position: 1, content: [] },
    ] },
  ], 0);
  const enrollment = await repositories.enrollments.create({
    studentEmail, studentName: "Test alumno", courseId: course.legacyId, status: "Activo",
  });
  const path = `/api/student/enrollments/${enrollment.id}/progress`;
  const mark = (lessonId: string, completed: boolean) => api<{ data: { progress: number } }>(
    server.baseUrl, path, {
      method: "PATCH", token: studentToken,
      body: JSON.stringify({ lessonId, completed }),
    },
  );

  assert.equal((await mark("1.1", true)).body.data.progress, 50);
  assert.equal((await mark("1.1", true)).body.data.progress, 50);
  const concurrent = await Promise.all([mark("1.1", true), mark("1.1", true)]);
  assert.deepEqual(concurrent.map((response) => response.status), [200, 200]);
  assert.deepEqual(
    (await repositories.enrollments.findById(enrollment.id))?.completedLessonIds,
    ["1.1"],
  );

  assert.equal((await mark("9.9", true)).status, 400);
  const unmarked = await mark("1.1", false);
  assert.equal(unmarked.status, 200);
  assert.equal(unmarked.body.data.progress, 0);
  assert.deepEqual(
    (await repositories.enrollments.findById(enrollment.id))?.completedLessonIds,
    [],
  );
});

test("curriculum edits recalculate progress without corrupting completed history", async () => {
  const teacherToken = await login("profesor", teacherEmail);
  const studentToken = await login("alumno", studentEmail);
  const course = await repositories.courses.create({
    title: "Curriculum Progress Course", description: "Reorder, add and delete lessons test.",
    priceCents: 10_000, duration: "Online", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail, status: "draft",
    img: "https://example.test/curriculum.jpg",
  });
  await repositories.courses.saveModules(course.legacyId, [
    { id: 1, title: "First", position: 1, lessons: [
      { id: "1.1", title: "A", type: "doc", position: 1, content: [] },
      { id: "1.2", title: "B", type: "doc", position: 2, content: [] },
    ] },
    { id: 2, title: "Second", position: 2, lessons: [
      { id: "2.1", title: "C", type: "doc", position: 1, content: [] },
    ] },
  ], 0);
  const enrollment = await repositories.enrollments.create({
    studentEmail, studentName: "Test alumno", courseId: course.legacyId,
    status: "Activo", completedLessonIds: ["1.1"],
  });
  const view = () => api<{ data: {
    progress: number;
    modules: { id: number; status: string; lessons: { id: string; done: boolean }[] }[];
  } }>(server.baseUrl, `/api/student/enrollments/${enrollment.id}`, { token: studentToken });

  let data = (await view()).body.data;
  assert.equal(data.progress, 33);
  assert.equal(data.modules[0]?.status, "in_progress");
  assert.equal(data.modules[1]?.status, "locked");

  const reordered = await api(server.baseUrl,
    `/api/teacher/courses/${course.legacyId}/modules/1/lessons/reorder`, {
      method: "PUT", token: teacherToken, body: JSON.stringify({ ids: ["1.2", "1.1"] }),
    });
  assert.equal(reordered.status, 200);
  data = (await view()).body.data;
  assert.deepEqual(data.modules[0]?.lessons.map((lesson) => lesson.id), ["1.2", "1.1"]);
  assert.equal(data.modules[0]?.lessons.find((lesson) => lesson.id === "1.1")?.done, true);
  assert.equal(data.progress, 33);

  const added = await api(server.baseUrl,
    `/api/teacher/courses/${course.legacyId}/modules/1/lessons`, {
      method: "POST", token: teacherToken,
      body: JSON.stringify({ title: "Nueva lección", type: "doc" }),
    });
  assert.equal(added.status, 201);
  data = (await view()).body.data;
  assert.equal(data.progress, 25);
  assert.equal(data.modules[0]?.status, "in_progress");
  assert.equal(data.modules[1]?.status, "locked");

  // A lesson deleted before the enrollment existed stays in the stored history
  // but no longer counts toward progress.
  const deletedCourse = await repositories.courses.create({
    title: "Deleted Lesson Course", description: "Historical completed id test.",
    priceCents: 10_000, duration: "Online", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail, status: "draft",
    img: "https://example.test/deleted.jpg",
  });
  await repositories.courses.saveModules(deletedCourse.legacyId, [
    { id: 1, title: "First", position: 1, lessons: [
      { id: "1.1", title: "Removed", type: "doc", position: 1, content: [] },
      { id: "1.2", title: "Kept", type: "doc", position: 2, content: [] },
    ] },
  ], 0);
  assert.equal((await api(server.baseUrl,
    `/api/teacher/courses/${deletedCourse.legacyId}/modules/1/lessons/1.1`, {
      method: "DELETE", token: teacherToken,
    })).status, 200);
  const historical = await repositories.enrollments.create({
    studentEmail, studentName: "Test alumno", courseId: deletedCourse.legacyId,
    status: "Activo", completedLessonIds: ["1.1", "ghost"],
  });
  const historicalView = await api<{ data: { progress: number } }>(server.baseUrl,
    `/api/student/enrollments/${historical.id}`, { token: studentToken });
  assert.equal(historicalView.body.data.progress, 0);
  assert.deepEqual(
    (await repositories.enrollments.findById(historical.id))?.completedLessonIds,
    ["1.1", "ghost"],
  );
});

test("checkout and receipt keep the order pending until Mercado Pago confirms it", async () => {
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
  const manualApproval = await api(server.baseUrl, `/api/admin/orders/${checkout.body.data.order.id}`, {
    method: "PATCH", token: adminToken, body: JSON.stringify({ estado: "Pagado", motivo: "Pago manual verificado" }),
  });
  assert.equal(manualApproval.status, 400);
  const enrollment = await repositories.enrollments.findById(checkout.body.data.enrollment.id);
  assert.equal(enrollment?.status, "Pendiente");
  const events = await api<{ data: { actorId?: string; reason: string; previousStatus: string; nextStatus: string }[] }>(
    server.baseUrl, `/api/admin/orders/${checkout.body.data.order.id}/events`, { token: adminToken },
  );
  assert.equal(events.status, 200);
  assert.equal(events.body.data.length, 0);
  assert.equal((await api(server.baseUrl, `/api/admin/orders/${checkout.body.data.order.id}`, {
    method: "PATCH", token: adminToken,
    body: JSON.stringify({ estado: "Reembolsado" }),
  })).status, 400);
  assert.equal((await api(server.baseUrl, `/api/admin/orders/${checkout.body.data.order.id}`, {
    method: "PATCH", token: adminToken,
    body: JSON.stringify({ estado: "Pendiente", motivo: "Intento de reversión inválida" }),
  })).status, 400);
});

test("checkout refuses an unavailable provider without creating a manual order", async () => {
  const course = (await repositories.courses.listPublished())[0];
  assert.ok(course);
  const before = (await repositories.orders.list()).length;
  setPaymentGatewayForTests(null);
  try {
    const response = await api(server.baseUrl, "/api/checkout", {
      method: "POST", body: JSON.stringify({
        courseSlug: course.slug, nombre: "Provider Unavailable", email: "unavailable@example.test", dni: "30123456",
      }),
    });
    assert.equal(response.status, 503);
    assert.equal((await repositories.orders.list()).length, before);
  } finally {
    setPaymentGatewayForTests(checkoutGateway);
  }
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

test("an If-Match revision guards edits and reports the current version on conflict", async () => {
  const course = await repositories.courses.create({
    title: "Revision Guard Test", description: "Optimistic concurrency guard",
    priceCents: 40_000, duration: "Online", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail,
    status: "draft", img: "https://example.test/revision.jpg",
  });
  const moduleId = 9701;
  await repositories.courses.saveModules(course.legacyId, [{
    id: moduleId, title: "Original module", position: 0, lessons: [],
  }], 0);
  const token = await login("profesor", teacherEmail);
  const path = `/api/teacher/courses/${course.legacyId}/modules/${moduleId}`;

  const stale = await api<{ error: { code: string; details: { currentRevision: number } } }>(
    server.baseUrl, path,
    { method: "PATCH", token, headers: { "if-match": "99" }, body: JSON.stringify({ title: "Stale" }) },
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, "CONFLICT");
  assert.equal(stale.body.error.details.currentRevision, 1);
  assert.equal((await repositories.courses.findById(course.legacyId))?.modules[0]?.title, "Original module");

  const accepted = await api<{ data: { title: string; position: number }[] }>(
    server.baseUrl, path,
    { method: "PATCH", token, headers: { "if-match": "1" }, body: JSON.stringify({ title: "Accepted" }) },
  );
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get("x-course-revision"), "2");
  assert.equal(accepted.headers.get("etag"), "\"2\"");
  assert.equal(accepted.body.data[0]?.title, "Accepted");

  const replay = await api(server.baseUrl, path, {
    method: "PATCH", token, headers: { "if-match": "1" }, body: JSON.stringify({ title: "Late" }),
  });
  assert.equal(replay.status, 409);
  await repositories.courses.delete(course.legacyId, (await repositories.courses.findById(course.legacyId))!.revision ?? 0);
});

test("retrying a creation with the same Idempotency-Key creates neither duplicates nor extra revisions", async () => {
  const course = await repositories.courses.create({
    title: "Idempotent Creation Test", description: "Creation retries",
    priceCents: 30_000, duration: "Online", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail,
    status: "draft", img: "https://example.test/idempotent.jpg",
  });
  const token = await login("profesor", teacherEmail);
  const base = `/api/teacher/courses/${course.legacyId}`;
  const moduleKey = "module-request-0001";
  const createModule = () => api<{ data: { id: number; title: string; requestId?: string }[] }>(
    server.baseUrl, `${base}/modules`,
    { method: "POST", token, headers: { "idempotency-key": moduleKey }, body: JSON.stringify({ title: "Only once" }) },
  );

  const first = await createModule();
  const retry = await createModule();
  assert.equal(first.status, 201);
  assert.equal(retry.status, 201);
  assert.equal(retry.headers.get("x-course-revision"), "1");
  const stored = await repositories.courses.findById(course.legacyId);
  assert.equal(stored?.modules.length, 1);
  const moduleId = stored!.modules[0]!.id;
  assert.equal(stored!.modules[0]!.requestId, moduleKey);
  assert.deepEqual(retry.body.data.map((mod) => mod.id), first.body.data.map((mod) => mod.id));

  const lessonKey = "lesson-request-0001";
  const createLesson = () => api<{ data: { id: number; lessons: { id: string; requestId?: string }[] }[] }>(
    server.baseUrl, `${base}/modules/${moduleId}/lessons`,
    { method: "POST", token, headers: { "idempotency-key": lessonKey }, body: JSON.stringify({ title: "Only lesson", type: "doc" }) },
  );
  const firstLesson = await createLesson();
  const retryLesson = await createLesson();
  assert.equal(firstLesson.status, 201);
  assert.equal(retryLesson.status, 201);
  assert.equal(retryLesson.headers.get("x-course-revision"), "2");
  const withLesson = await repositories.courses.findById(course.legacyId);
  assert.equal(withLesson?.modules[0]?.lessons.length, 1);
  assert.equal(withLesson?.modules[0]?.lessons[0]?.requestId, lessonKey);
  assert.deepEqual(retryLesson.body.data, firstLesson.body.data);
  await repositories.courses.delete(course.legacyId, (await repositories.courses.findById(course.legacyId))!.revision ?? 0);
});

test("reordering modules and lessons persists by stable IDs without duplicating or losing items", async () => {
  const course = await repositories.courses.create({
    title: "Stable Order Test", description: "ID-based reordering",
    priceCents: 20_000, duration: "Online", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail,
    status: "draft", img: "https://example.test/order.jpg",
  });
  const token = await login("profesor", teacherEmail);
  const base = `/api/teacher/courses/${course.legacyId}`;
  let revision = 0;
  const addModule = async (title: string) => {
    const response = await api<{ data: { id: number; title: string }[] }>(server.baseUrl, `${base}/modules`, {
      method: "POST", token, headers: { "if-match": String(revision) }, body: JSON.stringify({ title }),
    });
    assert.equal(response.status, 201);
    revision = Number(response.headers.get("x-course-revision"));
    return response.body.data.at(-1)!.id;
  };
  const alpha = await addModule("Alpha");
  const beta = await addModule("Beta");
  const gamma = await addModule("Gamma");

  const reorderModules = async (ids: number[]) => api<{ data: { id: number; position: number }[] }>(
    server.baseUrl, `${base}/modules/reorder`,
    { method: "PUT", token, headers: { "if-match": String(revision) }, body: JSON.stringify({ ids }) },
  );
  const reversed = await reorderModules([gamma, alpha, beta]);
  assert.equal(reversed.status, 200);
  assert.deepEqual(reversed.body.data.map((mod) => mod.id), [gamma, alpha, beta]);
  assert.deepEqual(reversed.body.data.map((mod) => mod.position), [0, 1, 2]);
  revision = Number(reversed.headers.get("x-course-revision"));

  const addLesson = async (moduleId: number, title: string) => {
    const response = await api<{ data: { id: number; lessons: { id: string }[] }[] }>(
      server.baseUrl, `${base}/modules/${moduleId}/lessons`,
      { method: "POST", token, headers: { "if-match": String(revision) }, body: JSON.stringify({ title, type: "doc" }) },
    );
    assert.equal(response.status, 201);
    revision = Number(response.headers.get("x-course-revision"));
    return response.body.data.find((mod) => mod.id === moduleId)!.lessons.at(-1)!.id;
  };
  const one = await addLesson(gamma, "Uno");
  const two = await addLesson(gamma, "Dos");
  const three = await addLesson(gamma, "Tres");

  const reorderLessons = await api<{ data: { id: number; lessons: { id: string; position: number }[] }[] }>(
    server.baseUrl, `${base}/modules/${gamma}/lessons/reorder`,
    { method: "PUT", token, headers: { "if-match": String(revision) }, body: JSON.stringify({ ids: [three, one, two] }) },
  );
  assert.equal(reorderLessons.status, 200);
  const gammaLessons = reorderLessons.body.data.find((mod) => mod.id === gamma)!.lessons;
  assert.deepEqual(gammaLessons.map((lesson) => lesson.id), [three, one, two]);
  assert.deepEqual(gammaLessons.map((lesson) => lesson.position), [0, 1, 2]);

  const stored = await repositories.courses.findById(course.legacyId);
  assert.deepEqual(stored?.modules.map((mod) => mod.id), [gamma, alpha, beta]);
  assert.deepEqual(stored?.modules[0]?.lessons.map((lesson) => lesson.id), [three, one, two]);
  await repositories.courses.delete(course.legacyId, (await repositories.courses.findById(course.legacyId))!.revision ?? 0);
});

test("admin course creation is idempotent and recoverable by request key", async () => {
  const token = await login("admin", adminEmail);
  const key = "admin-course-request-0001";
  const payload = JSON.stringify({
    title: "Recoverable Admin Course",
    description: "Creation whose response may be lost",
    priceCents: 12_000,
    level: "Inicial",
    duration: "Online",
    professorEmail: teacherEmail,
  });
  const create = () => api<{ data: { id: number; slug: string; requestId?: string } }>(
    server.baseUrl, "/api/admin/courses",
    { method: "POST", token, headers: { "idempotency-key": key }, body: payload },
  );
  const first = await create();
  const retry = await create();
  assert.equal(first.status, 201);
  assert.equal(retry.status, 201);
  assert.equal(retry.body.data.id, first.body.data.id);
  assert.equal(
    (await repositories.courses.findByRequestId(key))?.legacyId,
    first.body.data.id,
  );
  assert.equal((await repositories.courses.list()).filter((c) => c.title === "Recoverable Admin Course").length, 1);

  const recovered = await api<{ data: { id: number } }>(
    server.baseUrl, `/api/admin/courses/by-request-id/${key}`,
    { token },
  );
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.data.id, first.body.data.id);
  await repositories.courses.delete(first.body.data.id, (await repositories.courses.findById(first.body.data.id))!.revision ?? 0);
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

test("teacher chat stays in the selected course and can start before the student writes", async () => {
  const studentToken = await login("alumno", studentEmail);
  const teacherToken = await login("profesor", teacherEmail);
  const secondCourse = await repositories.courses.create({
    title: "Second Chat Course", description: "A separate conversation for the same student.",
    priceCents: 100_000, duration: "On-Demand", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail, status: "draft", img: "",
  });
  const secondEnrollment = await repositories.enrollments.create({
    studentEmail, studentName: "Test alumno", courseId: secondCourse.legacyId, status: "Activo",
  });
  const firstPath = `/api/teacher/courses/${courseId}/students/${enrollmentId}/messages`;
  const secondPath = `/api/teacher/courses/${secondCourse.legacyId}/students/${secondEnrollment.id}/messages`;

  const empty = await api<{ data: { text: string }[] }>(server.baseUrl, secondPath, { token: teacherToken });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data, []);
  const initiated = await api<{ data: { text: string; from: string }[] }>(server.baseUrl, secondPath, {
    method: "POST", token: teacherToken, body: JSON.stringify({ text: "Second course greeting" }),
  });
  assert.equal(initiated.status, 201);
  assert.deepEqual(initiated.body.data.map((message) => message.text), ["Second course greeting"]);
  assert.equal(initiated.body.data[0]?.from, "prof");

  const first = await api<{ data: { text: string }[] }>(server.baseUrl, firstPath, { token: teacherToken });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.some((message) => message.text === "Second course greeting"), false);
  const studentPath = `/api/student/enrollments/${secondEnrollment.id}/messages`;
  const studentView = await api<{ data: { text: string }[] }>(server.baseUrl, studentPath, { token: studentToken });
  assert.deepEqual(studentView.body.data.map((message) => message.text), ["Second course greeting"]);
  const answer = await api<{ data: { text: string }[] }>(server.baseUrl, studentPath, {
    method: "POST", token: studentToken, body: JSON.stringify({ text: "Second course answer" }),
  });
  assert.equal(answer.status, 201);
  const refreshed = await api<{ data: { text: string }[] }>(server.baseUrl, secondPath, { token: teacherToken });
  assert.deepEqual(refreshed.body.data.map((message) => message.text),
    ["Second course greeting", "Second course answer"]);

  assert.equal((await api(server.baseUrl,
    `/api/teacher/courses/${courseId}/students/${secondEnrollment.id}/messages`,
    { token: teacherToken })).status, 404);
  assert.equal((await api(server.baseUrl, secondPath, { token: studentToken })).status, 403);
  const pending = await repositories.enrollments.create({
    studentEmail: "pending-chat@example.test", studentName: "Pending Chat",
    courseId: secondCourse.legacyId, status: "Pendiente",
  });
  assert.equal((await api(server.baseUrl,
    `/api/teacher/courses/${secondCourse.legacyId}/students/${pending.id}/messages`,
    { token: teacherToken })).status, 403);

  const simultaneousCourse = await repositories.courses.create({
    title: "Simultaneous Chat Course", description: "Both participants start the chat together.",
    priceCents: 100_000, duration: "On-Demand", level: "Inicial",
    professor: "Test profesor", professorEmail: teacherEmail, status: "draft", img: "",
  });
  const simultaneousEnrollment = await repositories.enrollments.create({
    studentEmail, studentName: "Test alumno", courseId: simultaneousCourse.legacyId, status: "Activo",
  });
  const studentChat = `/api/student/enrollments/${simultaneousEnrollment.id}/messages`;
  const teacherChat = `/api/teacher/courses/${simultaneousCourse.legacyId}/students/${simultaneousEnrollment.id}/messages`;
  const [studentFirst, teacherFirst] = await Promise.all([
    api(server.baseUrl, studentChat, { method: "POST", token: studentToken,
      body: JSON.stringify({ text: "Student first" }) }),
    api(server.baseUrl, teacherChat, { method: "POST", token: teacherToken,
      body: JSON.stringify({ text: "Teacher first" }) }),
  ]);
  assert.equal(studentFirst.status, 201);
  assert.equal(teacherFirst.status, 201);
  const both = await api<{ data: { text: string }[] }>(server.baseUrl, teacherChat, { token: teacherToken });
  assert.deepEqual(new Set(both.body.data.map((message) => message.text)),
    new Set(["Student first", "Teacher first"]));
});

test("admin paginated lists use repository data", async () => {
  const token = await login("admin", adminEmail);
  const users = await api<{ data: Record<string, unknown>[] }>(server.baseUrl, "/api/admin/users?role=alumno&limit=1&offset=0", { token });
  assert.equal(users.status, 200);
  assert.equal(users.body.data.length, 1);
  assert.equal("passwordHash" in users.body.data[0], false);
  assert.equal("dni" in users.body.data[0], false);
});

test("checkout waits for payment, then creates the student with the DNI password", async () => {
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

  const paid = await applyOrderTransition({
    reference: pendingOrder.externalReference, status: "Pagado", source: "mercadopago",
    providerEventId: "test-buyer-approved", providerPaymentId: "12345001",
    paymentStatus: "approved", reason: "Mercado Pago confirmó el cobro",
  });
  assert.ok(paid);
  const newStudent = await repositories.users.findByEmail("buyer@example.test");
  assert.equal(newStudent?.role, "alumno");
  assert.equal(JSON.stringify(newStudent).includes(buyerDni), false);
  assert.equal(newStudent?.sessionVersion, 0);
  assert.ok(newStudent && (await verifyPassword(buyerDni, newStudent.passwordHash)));

  const enrolled = await repositories.enrollments.findById(created.body.data.enrollment.id);
  assert.equal(enrolled?.status, "Activo");

  const revoked = await applyOrderTransition({
    reference: pendingOrder.externalReference, status: "Reembolsado", source: "mercadopago",
    providerEventId: "test-buyer-refunded", providerPaymentId: "12345001",
    paymentStatus: "refunded", reason: "Mercado Pago devolvió el cobro",
  });
  assert.ok(revoked);
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
    { path: "/api/checkout", method: "POST", body: { courseSlug: "test-course", nombre: "Valid Buyer", email: "buyer@example.test", dni: "30123456", paymentMethod: "manual" } },
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

  const initial = await rawLogin(user.email, suspendPassword);
  assert.equal(initial.status, 200);
  const token = initial.body.data!.token;
  assert.equal((await api(server.baseUrl, "/api/student/enrollments", { token })).status, 200);

  assert.equal((await api(server.baseUrl, `/api/admin/users/${user.id}`, {
    method: "PATCH", token: adminToken, body: JSON.stringify({ status: "Suspendido" }),
  })).status, 200);
  assert.equal((await api(server.baseUrl, "/api/auth/session", { token })).status, 401);
  assert.equal((await rawLogin(user.email, suspendPassword)).status, 401);

  assert.equal((await api(server.baseUrl, `/api/admin/users/${user.id}`, {
    method: "PATCH", token: adminToken, body: JSON.stringify({ status: "Activo" }),
  })).status, 200);
  // Reactivating does not resurrect tokens issued before the suspension.
  assert.equal((await api(server.baseUrl, "/api/auth/session", { token })).status, 401);
  assert.equal((await rawLogin(user.email, suspendPassword)).status, 200);

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

  const first = await rawLogin(user.email, originalPassword);
  assert.equal(first.status, 200);
  const token = first.body.data!.token;
  assert.equal((await api(server.baseUrl, "/api/auth/session", { token })).status, 200);

  const changed = await api(server.baseUrl, `/api/admin/users/${user.id}`, {
    method: "PATCH", token: adminToken, body: JSON.stringify({ password: nextPassword }),
  });
  assert.equal(changed.status, 200);
  assert.equal((await api(server.baseUrl, "/api/auth/session", { token })).status, 401);
  assert.equal((await rawLogin(user.email, originalPassword)).status, 401);
  assert.equal((await rawLogin(user.email, nextPassword)).status, 200);
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

  const first = await loginService({ email: user.email, password: initialPassword });
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
    loginService({ email: user.email, password: initialPassword }),
  );
  const nextSession = await loginService({ email: user.email, password: nextPassword });
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

  const session = await loginService({ email, password: dni });
  const changed = await api(server.baseUrl, "/api/auth/password", {
    method: "POST",
    token: session.token,
    body: JSON.stringify({ currentPassword: dni, newPassword: nextPassword }),
  });
  assert.equal(changed.status, 200);
  await assert.rejects(loginService({ email, password: dni }));
  const nextSession = await loginService({ email, password: nextPassword });
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
    { method: "POST", body: JSON.stringify({ email: "not-an-email" }) },
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
    await loginService({ email: newProfessor.email, password })
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
      email: adminEmail, password: "invalid",
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
        dni: "32123456",
      }),
    });
    assert.equal(response.status, 500);
    assert.equal((await repositories.orders.list()).some((order) => order.email === "rollback@example.test"), false);
    assert.equal(await repositories.enrollments.findByStudentAndCourse("rollback@example.test", course.legacyId), null);
  } finally {
    repositories.enrollments.create = originalCreate;
  }
});

test("returning from Mercado Pago verifies the payment and activates the order without a webhook", async () => {
  const course = await repositories.courses.create({
    title: "Return Payment Course", description: "Return flow test", priceCents: 45_000,
    duration: "Online", level: "Inicial", img: "https://example.test/return.jpg",
    professor: "Test profesor", professorEmail: teacherEmail, status: "published",
  });
  let reference = "";
  let payment: PaymentSnapshot = {
    id: "987654321", externalReference: "", status: "approved", statusDetail: "accredited",
    amountCents: 45_000, currency: "ARS",
  };
  setPaymentGatewayForTests({
    async createPreference(input) {
      reference = input.reference;
      return { id: "pref-return", url: "https://www.mercadopago.com.ar/checkout/test" };
    },
    async getPayment() { return { ...payment, externalReference: payment.externalReference || reference }; },
    async findPaymentsByReference() { return [payment.id]; },
  });
  try {
    const buyerEmail = "return-buyer@example.test";
    const checkout = await api<{ data: { order: { id: string } } }>(server.baseUrl, "/api/checkout", {
      method: "POST", body: JSON.stringify({ courseSlug: course.slug, nombre: "Return Buyer",
        email: buyerEmail, dni: "33123456" }),
    });
    assert.equal(checkout.status, 201);
    const orderId = checkout.body.data.order.id;
    const reconcile = (email = buyerEmail, paymentId = payment.id) => api<{ data: { estado: string } }>(
      server.baseUrl, `/api/orders/${encodeURIComponent(reference)}/reconcile`, {
        method: "POST", body: JSON.stringify({ email, paymentId }),
      },
    );
    assert.equal((await reconcile("other@example.test")).status, 404);
    payment = { ...payment, amountCents: 1 };
    assert.equal((await reconcile()).status, 400);
    payment = { ...payment, amountCents: 45_000, externalReference: "wrong-reference" };
    assert.equal((await reconcile()).status, 400);
    payment = { ...payment, externalReference: "" };
    assert.equal((await reconcile(buyerEmail, "bad-id")).status, 400);
    payment = { ...payment, status: "rejected", statusDetail: "cc_rejected_other_reason" };
    assert.equal((await reconcile()).body.data.estado, "Rechazado");
    assert.equal((await repositories.orders.findByReference(orderId))?.paymentId, undefined);
    payment = { ...payment, id: "987654322", status: "approved", statusDetail: "accredited" };
    const withoutPaymentId = await api<{ data: { estado: string } }>(server.baseUrl,
      `/api/orders/${encodeURIComponent(reference)}/reconcile`, {
        method: "POST", body: JSON.stringify({ email: buyerEmail }),
      });
    assert.equal(withoutPaymentId.status, 200);
    assert.equal(withoutPaymentId.body.data.estado, "Pagado");
    assert.equal((await reconcile()).body.data.estado, "Pagado");
    assert.equal((await repositories.paymentEvents.listByOrder(orderId)).length, 2);
    assert.equal((await repositories.enrollments.findByStudentAndCourse(buyerEmail, course.legacyId))?.status, "Activo");
    assert.ok(await repositories.users.findByEmail(buyerEmail));
  } finally {
    setPaymentGatewayForTests(checkoutGateway);
  }
});

test("signed Mercado Pago events activate once, reject a wrong amount, and revoke on refund", async () => {
  const course = await repositories.courses.create({
    title: "Payment Course", description: "Verified gateway test", priceCents: 123_400,
    duration: "Online", level: "Inicial", img: "https://example.test/payment.jpg",
    professor: "Test profesor", professorEmail: teacherEmail, status: "published",
    accessDays: 30,
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
    const notify = async (eventId: string, signatureValid = true, requestedPaymentId = paymentId,
      timestamp = Date.now()) => {
      const requestId = `request-${eventId}`;
      const ts = String(timestamp);
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
    assert.equal((await notify("expired-signature", true, paymentId, Date.now() - 360_000)).status, 401);
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
    const paidEnrollment = await repositories.enrollments.findByStudentAndCourse("payment@example.test", course.legacyId);
    assert.ok(paidEnrollment?.expiresAt);
    const accessMs = Date.parse(paidEnrollment!.expiresAt!) - Date.now();
    assert.ok(accessMs > 29 * 86_400_000 && accessMs <= 30 * 86_400_000);
    assert.equal((await repositories.enrollments.listAll()).filter((item) =>
      item.studentEmail === "payment@example.test" && item.courseId === course.legacyId).length, 1);
    assert.ok(await repositories.users.findByEmail("payment@example.test"));
    assert.equal((await repositories.paymentEvents.listByOrder(orderId)).length, 1);
    // A different attempt can reach the transaction after the paid attempt
    // wins; it must not revoke the enrollment even if its webhook was valid.
    assert.equal(await applyOrderTransition({
      reference, status: "Reembolsado", source: "mercadopago",
      providerEventId: "other-attempt-refund", providerPaymentId: "999999999",
      paymentStatus: "refunded", reason: "Otro intento reembolsado",
    }), null);
    assert.equal((await repositories.orders.findByReference(orderId))?.estado, "Pagado");
    assert.equal((await repositories.enrollments.findByStudentAndCourse("payment@example.test", course.legacyId))?.status, "Activo");
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
    setPaymentGatewayForTests(checkoutGateway);
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
