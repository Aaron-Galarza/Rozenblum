import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { createMockRepositories } from "../repositories/mock.js";
import { setRepositoriesForTests } from "../repositories/index.js";
import { api, startTestServer, type TestServer } from "./helpers.js";

const password = "test-password-12345";
const studentEmail = "student@example.test";
const teacherEmail = "teacher@example.test";
const adminEmail = "admin@example.test";
const repositories = createMockRepositories({
  settings: {
    companyName: "Test Company",
    supportEmail: "support@example.test",
    contactWhatsapp: "5491112345678",
    logoUrl: "",
    privacyText: "Test privacy text for the isolated API tests.",
    updatedAt: new Date().toISOString(),
  },
});

let server: TestServer;
let courseId: number;
let enrollmentId: string;

async function login(role: "alumno" | "profesor" | "admin", email: string) {
  const response = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ role, email, password }),
  });
  assert.equal(response.status, 200);
  return response.body.data.token;
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
      passwordHash: hashPassword(password),
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
  ]);
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
  const token = await login("admin", adminEmail);
  const session = await api(server.baseUrl, "/api/auth/session", { token });
  assert.equal(session.status, 200);
});

test("published courses expose metadata while lesson content remains private", async () => {
  const list = await api<{ data: { slug: string }[] }>(server.baseUrl, "/api/courses");
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);
  const detail = await api<{ data: { modules: { lessons: { content?: unknown }[] }[] } }>(
    server.baseUrl, `/api/courses/${list.body.data[0]?.slug}`,
  );
  assert.equal(detail.status, 200);
  assert.ok(detail.body.data.modules.every((module) => module.lessons.every((lesson) => !lesson.content)));
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
      courseSlug: otherCourse.slug, nombre: "Test alumno", email: studentEmail, password,
    }) },
  );
  assert.equal(checkout.status, 201);
  const receipt = await api(server.baseUrl, `/api/orders/${checkout.body.data.order.externalReference}?email=${studentEmail}`);
  assert.equal(receipt.status, 200);
  const adminToken = await login("admin", adminEmail);
  const paid = await api(server.baseUrl, `/api/admin/orders/${checkout.body.data.order.id}`, {
    method: "PATCH", token: adminToken, body: JSON.stringify({ estado: "Pagado" }),
  });
  assert.equal(paid.status, 200);
  const enrollment = await repositories.enrollments.findById(checkout.body.data.enrollment.id);
  assert.equal(enrollment?.status, "Activo");
});

test("admin user creation requires an explicit password", async () => {
  const token = await login("admin", adminEmail);
  const missing = await api(server.baseUrl, "/api/admin/users", { method: "POST", token, body: JSON.stringify({
    role: "alumno", name: "Another Test", email: "another@example.test",
  }) });
  assert.equal(missing.status, 400);
  const created = await api(server.baseUrl, "/api/admin/users", { method: "POST", token, body: JSON.stringify({
    role: "alumno", name: "Another Test", email: "another@example.test", password,
  }) });
  assert.equal(created.status, 201);
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
  assert.equal((await repositories.contacts.list()).length, 1);
});

test("teacher can create, update, and remove lesson content", async () => {
  const token = await login("profesor", teacherEmail);
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
  const edited = await api(server.baseUrl, `/api/teacher/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`, {
    method: "PATCH", token, body: JSON.stringify({ title: "Updated lesson" }),
  });
  assert.equal(edited.status, 200);
  const removed = await api(server.baseUrl, `/api/teacher/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`, {
    method: "DELETE", token,
  });
  assert.equal(removed.status, 200);
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
  const users = await api<{ data: unknown[] }>(server.baseUrl, "/api/admin/users?role=alumno&limit=1&offset=0", { token });
  assert.equal(users.status, 200);
  assert.equal(users.body.data.length, 1);
});

test("payment reversal revokes course access", async () => {
  const token = await login("admin", adminEmail);
  const course = (await repositories.courses.listPublished()).find((item) => item.legacyId !== courseId);
  assert.ok(course);
  const created = await api<{ data: { order: { id: string }; enrollment: { id: string } } }>(
    server.baseUrl, "/api/checkout", { method: "POST", body: JSON.stringify({
      courseSlug: course.slug, nombre: "Another buyer", email: "buyer@example.test", password,
    }) },
  );
  assert.equal(created.status, 201);
  const newStudent = await repositories.users.findByEmail("buyer@example.test");
  assert.equal(newStudent?.role, "alumno");
  assert.ok(newStudent && verifyPassword(password, newStudent.passwordHash));
  for (const [estado, expected] of [["Pagado", "Activo"], ["Reembolsado", "Revocado"]] as const) {
    const result = await api(server.baseUrl, `/api/admin/orders/${created.body.data.order.id}`, {
      method: "PATCH", token, body: JSON.stringify({ estado }),
    });
    assert.equal(result.status, 200);
    assert.equal((await repositories.enrollments.findById(created.body.data.enrollment.id))?.status, expected);
  }
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
    initials: "OS", passwordHash: hashPassword(password),
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
    { path: "/api/checkout", method: "POST", body: { courseSlug: "test-course", nombre: "Jo", email: "buyer@example.test", password } },
    { path: `/api/teacher/courses/${courseId}/modules`, method: "POST", token: teacherToken, body: { title: "x".repeat(181) } },
    { path: `/api/teacher/courses/${courseId}/modules/1/lessons`, method: "POST", token: teacherToken, body: { title: " ", type: "doc" } },
    { path: `/api/teacher/courses/${courseId}/modules/1/lessons`, method: "POST", token: teacherToken, body: { title: "Bad link", type: "doc", content: [{ id: "bad", type: "link", content: "javascript:alert(1)" }] } },
    { path: `/api/teacher/courses/${courseId}/modules/1/lessons/reorder`, method: "PUT", token: teacherToken, body: { ids: [] } },
    { path: "/api/admin/courses", method: "POST", token: adminToken, body: { title: "Valid title", description: "Valid description", priceCents: -1, professor: "Test profesor", duration: "Online", level: "Inicial" } },
    { path: "/api/admin/users", method: "POST", token: adminToken, body: { role: "alumno", name: "New Student", email: "new@example.test", password: "short" } },
    { path: "/api/admin/settings", method: "PUT", token: adminToken, body: { companyName: "Test Company", supportEmail: "support@example.test", contactWhatsapp: "abc", logoUrl: "", privacyText: "A complete privacy policy" } },
    { path: "/api/admin/orders/unknown", method: "PATCH", token: adminToken, body: { estado: "Unknown" } },
  ];
  for (const item of cases) {
    const response = await api(server.baseUrl, item.path, { method: item.method, token: item.token, body: JSON.stringify(item.body) });
    assert.equal(response.status, 400, `${item.method} ${item.path}`);
  }
});

test("empty courses cannot be published or sold, and related records block deletion", async () => {
  const adminToken = await login("admin", adminEmail);
  const teacherToken = await login("profesor", teacherEmail);
  const created = await api<{ data: { id: number; slug: string } }>(server.baseUrl, "/api/admin/courses", {
    method: "POST", token: adminToken, body: JSON.stringify({
      title: "Boundary Course", description: "A course for publication boundaries", priceCents: 123_400,
      professor: "Test profesor", duration: "Two weeks", level: "Inicial", status: "draft",
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
  assert.equal((await api(server.baseUrl, `/api/admin/courses/${id}`, { method: "PATCH", token: adminToken, body: JSON.stringify({ status: "published", priceCents: 250_000, duration: "Three weeks", level: "Intermedio" }) })).status, 200);
  const updated = await repositories.courses.findById(id);
  assert.equal(updated?.price.replaceAll("\u00a0", " "), "$ 2.500");
  assert.equal(updated?.duration, "Three weeks");
  assert.equal((await api(server.baseUrl, `/api/teacher/courses/${id}/modules/${moduleId}/lessons/1.1`, { method: "DELETE", token: teacherToken })).status, 400);
  const order = await api(server.baseUrl, "/api/checkout", { method: "POST", body: JSON.stringify({
    courseSlug: created.body.data.slug, nombre: "Boundary Buyer", email: "boundary-buyer@example.test", password,
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

test("login is rate limited after repeated invalid attempts", async () => {
  let limited = false;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const response = await api(server.baseUrl, "/api/auth/login", { method: "POST", body: JSON.stringify({
      role: "admin", email: adminEmail, password: "invalid",
    }) });
    if (response.status === 429) limited = true;
  }
  assert.equal(limited, true);
});
