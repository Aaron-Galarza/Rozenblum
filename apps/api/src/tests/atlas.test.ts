import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { hashPassword } from "../lib/password.js";
import { createMongooseRepositories } from "../repositories/mongoose.js";
import { api, startTestServer } from "./helpers.js";

// Explicit opt-in only. Every run uses a fresh database and removes it in finally.
test("Atlas persists auth, revocation and enrollment ownership", async () => {
  assert.equal(env.NODE_ENV, "development", "test:atlas solo se ejecuta en desarrollo.");
  assert.ok(env.MONGODB_URI, "test:atlas requiere MONGODB_URI.");
  const databaseName = `rozenblum_codex_test_${randomBytes(8).toString("hex")}`;
  let server: Awaited<ReturnType<typeof startTestServer>> | undefined;

  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: databaseName,
      serverSelectionTimeoutMS: 10_000,
    });
    assert.equal(mongoose.connection.db?.databaseName, databaseName);
    const repositories = createMongooseRepositories();
    const studentPassword = randomBytes(24).toString("hex");
    const adminPassword = randomBytes(24).toString("hex");
    const student = await repositories.users.create({
      name: "Test Student", email: "student@example.test", role: "alumno",
      initials: "TS", passwordHash: await hashPassword(studentPassword),
    });
    const other = await repositories.users.create({
      name: "Other Student", email: "other@example.test", role: "alumno",
      initials: "OS", passwordHash: await hashPassword(studentPassword),
    });
    await repositories.users.create({
      name: "Test Admin", email: "admin@example.test", role: "admin",
      initials: "TA", passwordHash: await hashPassword(adminPassword),
    });
    await repositories.users.create({
      name: "Test Professor", email: "professor@example.test", role: "profesor",
      initials: "TP", passwordHash: await hashPassword(adminPassword),
    });
    server = await startTestServer();
    const adminLogin = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/login", {
      method: "POST", body: JSON.stringify({ role: "admin", email: "admin@example.test", password: adminPassword }),
    });
    assert.equal(adminLogin.status, 200);
    const courseInput = {
      title: "Atlas Test Course", description: "Isolated authorization test course",
      priceCents: 100_000, duration: "Online", level: "Inicial",
      img: `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/Rozenblum/courses/test.jpg`,
      status: "draft", professorEmail: "professor@example.test",
    };
    const missingProfessor = await api(server.baseUrl, "/api/admin/courses", {
      method: "POST", token: adminLogin.body.data.token,
      body: JSON.stringify({ ...courseInput, professorEmail: "missing@example.test" }),
    });
    assert.equal(missingProfessor.status, 400);
    assert.equal((await repositories.courses.list()).length, 0);
    const createdCourse = await api<{ data: { id: number; slug: string } }>(server.baseUrl, "/api/admin/courses", {
      method: "POST", token: adminLogin.body.data.token, body: JSON.stringify(courseInput),
    });
    assert.equal(createdCourse.status, 201);
    const courseId = createdCourse.body.data.id;
    await repositories.courses.saveModules(courseId, [{
      id: 1, title: "First module", position: 0,
      lessons: [{ id: "1.1", title: "First lesson", type: "doc", position: 0, content: [] }],
    }]);
    const published = await api(server.baseUrl, `/api/admin/courses/${courseId}`, {
      method: "PATCH", token: adminLogin.body.data.token,
      body: JSON.stringify({ status: "published" }),
    });
    assert.equal(published.status, 200);
    const course = await repositories.courses.findById(courseId);
    assert.ok(course);
    assert.equal(course.professorEmail, "professor@example.test");
    const otherEnrollment = await repositories.enrollments.create({
      studentEmail: other.email, studentName: other.name,
      courseId: course.legacyId, status: "Activo",
    });

    const studentLogin = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/login", {
      method: "POST", body: JSON.stringify({ role: "alumno", email: student.email, password: studentPassword }),
    });
    assert.equal(studentLogin.status, 200);
    const studentToken = studentLogin.body.data.token;
    assert.equal((await api(server.baseUrl, "/api/auth/session", { token: studentToken })).status, 200);
    assert.equal((await api(server.baseUrl, "/api/admin/overview", { token: studentToken })).status, 403);
    assert.equal((await api(server.baseUrl, `/api/student/enrollments/${otherEnrollment.id}`, { token: studentToken })).status, 403);

    const buyerDni = "28999888";
    const checkout = await api<{ data: { order: { id: string }; enrollment: { id: string } } }>(
      server.baseUrl, "/api/checkout", {
        method: "POST",
        body: JSON.stringify({
          courseSlug: course.slug, nombre: "Atlas Buyer", email: "buyer@example.test", dni: buyerDni,
        }),
      },
    );
    assert.equal(checkout.status, 201);
    assert.equal(await repositories.users.findByEmail("buyer@example.test"), null);
    const rawOrder = await mongoose.connection.db!.collection("orders").findOne({ id: checkout.body.data.order.id });
    assert.ok(rawOrder?.dniPasswordHash);
    assert.equal(rawOrder.dni, undefined);
    assert.notEqual(rawOrder.dniPasswordHash, buyerDni);
    const paid = await api(server.baseUrl, `/api/admin/orders/${checkout.body.data.order.id}`, {
      method: "PATCH", token: adminLogin.body.data.token, body: JSON.stringify({ estado: "Pagado" }),
    });
    assert.equal(paid.status, 200);
    const buyer = await repositories.users.findByEmail("buyer@example.test");
    const rawBuyer = await mongoose.connection.db!.collection("users").findOne({ email: "buyer@example.test" });
    assert.equal(rawBuyer?.dni, undefined);
    assert.equal(buyer?.passwordHash, rawOrder.dniPasswordHash);
    assert.equal((await repositories.enrollments.findById(checkout.body.data.enrollment.id))?.status, "Activo");
    const buyerLogin = await api(server.baseUrl, "/api/auth/login", {
      method: "POST", body: JSON.stringify({ role: "alumno", email: "buyer@example.test", password: buyerDni }),
    });
    assert.equal(buyerLogin.status, 200);
    const suspended = await api(server.baseUrl, `/api/admin/users/${student.id}`, {
      method: "PATCH", token: adminLogin.body.data.token, body: JSON.stringify({ status: "Suspendido" }),
    });
    assert.equal(suspended.status, 200);
    assert.equal((await api(server.baseUrl, "/api/auth/session", { token: studentToken })).status, 401);
    assert.equal((await repositories.users.findById(student.id))?.sessionVersion, 1);
  } finally {
    await server?.close();
    if (mongoose.connection.db?.databaseName === databaseName) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  }
});
