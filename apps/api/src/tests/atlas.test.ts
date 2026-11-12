import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import mongoose from "mongoose";
import { BRAND_HERO_URL } from "@rozenblum/shared";
import { env } from "../config/env.js";
import { hashPassword } from "../lib/password.js";
import { ContactModel, CourseModel, EnrollmentModel, HomeContentModel, PaymentEventModel } from "../models/index.js";
import { setPaymentGatewayForTests } from "../services/mercadopago.js";
import { applyOrderTransition } from "../services/order-transitions.js";
import { createMongooseRepositories } from "../repositories/mongoose.js";
import type { StoredPaymentEvent } from "../types.js";
import { api, startTestServer } from "./helpers.js";

// Explicit opt-in only. Every run uses a fresh database and removes it in finally.
test("Atlas persists auth, revocation and enrollment ownership", async () => {
  assert.equal(env.NODE_ENV, "development", "test:atlas solo se ejecuta en desarrollo.");
  assert.ok(env.MONGODB_URI, "test:atlas requiere MONGODB_URI.");
  const databaseName = `rozenblum_codex_test_${randomBytes(8).toString("hex")}`;
  let server: Awaited<ReturnType<typeof startTestServer>> | undefined;

  try {
    setPaymentGatewayForTests({
      async createPreference(input) {
        return { id: `pref-${input.reference}`, url: "https://www.mercadopago.com.ar/checkout/test" };
      },
      async getPayment() { throw new Error("No se consulta el proveedor en esta prueba."); },
    });
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
    const professor = await repositories.users.create({
      name: "Test Professor", email: "professor@example.test", role: "profesor",
      initials: "TP", passwordHash: await hashPassword(adminPassword),
      img: "https://example.test/current-professor.jpg",
    });
    await HomeContentModel.create({
      key: "home",
      brand: {
        locationLabel: "Resistencia", foundedYear: "2020",
        metrics: [], aboutParagraphs: ["Atlas content"], footerTagline: "Test studio",
      },
      team: [{ name: "Test Professor", role: "Docente", img: "https://example.test/old-professor.jpg", userId: professor.id }],
      practiceAreas: [],
    });
    server = await startTestServer();
    const adminLogin = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/login", {
      method: "POST", body: JSON.stringify({ email: "admin@example.test", password: adminPassword }),
    });
    assert.equal(adminLogin.status, 200);
    const home = await api<{ data: { brand: { heroImage: string }; team: { img: string; userId?: string }[] } }>(
      server.baseUrl, "/api/content/home",
    );
    assert.equal(home.status, 200);
    assert.equal(home.body.data.brand.heroImage, BRAND_HERO_URL);
    assert.equal(home.body.data.team[0]?.img, "https://example.test/current-professor.jpg");
    assert.equal(home.body.data.team[0]?.userId, undefined);
    assert.equal(JSON.stringify(home.body).includes('"_id"'), false);
    const contact = await api<{ data: { id: string; message: string } }>(
      server.baseUrl, "/api/contact", {
        method: "POST", body: JSON.stringify({
          name: "Atlas Contact", email: "Contact@Example.Test", message: "A real database contact inquiry.",
        }),
      },
    );
    assert.equal(contact.status, 201);
    assert.equal((await ContactModel.findOne({ id: contact.body.data.id }).lean().exec())?.email, "contact@example.test");
    const adminContacts = await api<{ data: { id: string }[] }>(
      server.baseUrl, "/api/admin/contacts?limit=1&offset=0", { token: adminLogin.body.data.token },
    );
    assert.equal(adminContacts.body.data[0]?.id, contact.body.data.id);
    await ContactModel.insertMany(["ctc_same_a", "ctc_same_b"].map((id) => ({
      id, name: "Same Time", email: "same@example.test",
      message: "Contact pagination test", createdAt: "2100-01-01T00:00:00.000Z",
    })));
    const equalTimeContacts = await api<{ data: { id: string }[] }>(
      server.baseUrl, "/api/admin/contacts?limit=2&offset=0", { token: adminLogin.body.data.token },
    );
    assert.deepEqual(equalTimeContacts.body.data.map(({ id }) => id), ["ctc_same_b", "ctc_same_a"]);
    const courseInput = {
      title: "Atlas Test Course", description: "Isolated authorization test course",
      priceCents: 100_000, duration: "Online", level: "Inicial",
      img: `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/Rozenblum/courses/test.jpg`,
      status: "draft", professorEmail: "professor@example.test",
      accessDays: 30,
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
    assert.equal((await api(server.baseUrl, `/api/courses/${createdCourse.body.data.slug}`)).status, 404);
    assert.equal((await api<{ data: unknown[] }>(server.baseUrl, "/api/courses")).body.data.length, 0);
    // Documents written before revision tracking must still accept the first edit.
    await CourseModel.updateOne({ legacyId: courseId }, { $unset: { revision: 1 } }).exec();
    assert.ok(await repositories.courses.saveModules(courseId, [{
      id: 1, title: "First module", position: 0,
      lessons: [{ id: "1.1", title: "First lesson", type: "doc", position: 0,
        content: [{ id: "private", type: "paragraph", content: "PRIVATE ATLAS LESSON" }],
        document: { version: 1, blocks: [{ type: "paragraph", content: "PRIVATE BLOCKNOTE" }] },
      }],
    }], 0));
    assert.equal((await repositories.courses.findById(courseId))?.revision, 1);
    const published = await api(server.baseUrl, `/api/admin/courses/${courseId}`, {
      method: "PATCH", token: adminLogin.body.data.token,
      body: JSON.stringify({ status: "published" }),
    });
    assert.equal(published.status, 200);
    const lessonPath = `/api/teacher/courses/${courseId}/modules/1/lessons/1.1`;
    const richDocument = {
      version: 1,
      blocks: [{
        id: "atlas-rich", type: "paragraph", props: {},
        content: [{ type: "text", text: "Atlas rich content", styles: { bold: true } }],
        children: [],
      }],
    };
    assert.equal((await api(server.baseUrl, lessonPath, {
      method: "PATCH", token: adminLogin.body.data.token,
      body: JSON.stringify({ document: richDocument }),
    })).status, 200);
    assert.deepEqual((await repositories.courses.findById(courseId))?.modules[0]?.lessons[0]?.document, richDocument);
    assert.ok((await repositories.courses.findById(courseId))?.modules[0]?.lessons[0]?.updatedAt);
    const invalidDocument = structuredClone(richDocument);
    (invalidDocument.blocks[0] as typeof richDocument.blocks[0] & { props: { url?: string } }).props.url = "javascript:alert(1)";
    assert.equal((await api(server.baseUrl, lessonPath, {
      method: "PATCH", token: adminLogin.body.data.token,
      body: JSON.stringify({ document: invalidDocument }),
    })).status, 400);
    const beforeRace = (await repositories.courses.findById(courseId))!;
    const revisions = ["Concurrent A", "Concurrent B"].map((title) => {
      const modules = structuredClone(beforeRace.modules);
      modules[0]!.title = title;
      return modules;
    });
    const race = await Promise.all(revisions.map((modules) =>
      repositories.courses.saveModules(courseId, modules, beforeRace.revision ?? 0),
    ));
    assert.equal(race.filter(Boolean).length, 1);
    const raceWinner = (await repositories.courses.findById(courseId))!;
    assert.equal(raceWinner.revision, (beforeRace.revision ?? 0) + 1);
    assert.ok(["Concurrent A", "Concurrent B"].includes(raceWinner.modules[0]!.title));
    assert.equal((await api(server.baseUrl, `/api/admin/courses/${courseId}`, {
      method: "DELETE", token: adminLogin.body.data.token,
    })).status, 400);
    const publicList = await api<{ data: { slug: string; professorId?: string }[] }>(server.baseUrl, "/api/courses");
    assert.equal(publicList.body.data.length, 1);
    assert.equal(publicList.body.data[0]?.professorId, undefined);
    const projected = await repositories.courses.listPublished();
    assert.deepEqual(projected[0]?.modules, [{ id: 1 }]);
    assert.equal("professorEmail" in projected[0]!, false);
    const publicDetail = await api(server.baseUrl, `/api/courses/${createdCourse.body.data.slug}`);
    assert.equal(publicDetail.status, 200);
    assert.equal(JSON.stringify(publicDetail.body).includes("PRIVATE ATLAS LESSON"), false);
    assert.equal(JSON.stringify(publicDetail.body).includes("PRIVATE BLOCKNOTE"), false);
    assert.equal(JSON.stringify(publicDetail.body).includes("professor@example.test"), false);
    const teacherLogin = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/login", {
      method: "POST", body: JSON.stringify({ email: professor.email, password: adminPassword }),
    });
    assert.equal(teacherLogin.status, 200);
    const draft = await api<{ data: { id: number } }>(server.baseUrl, "/api/admin/courses", {
      method: "POST", token: adminLogin.body.data.token,
      body: JSON.stringify({ ...courseInput, title: "Atlas Academic Draft" }),
    });
    assert.equal(draft.status, 201);
    const draftPath = `/api/teacher/courses/${draft.body.data.id}`;
    assert.equal((await api(server.baseUrl, draftPath)).status, 401);
    const addedModule = await api<{ data: { id: number }[] }>(server.baseUrl, `${draftPath}/modules`, {
      method: "POST", token: teacherLogin.body.data.token,
      body: JSON.stringify({ title: "Draft module" }),
    });
    assert.equal(addedModule.status, 201);
    const draftModuleId = addedModule.body.data[0]!.id;
    const addedLesson = await api<{ data: { lessons: { id: string }[] }[] }>(
      server.baseUrl, `${draftPath}/modules/${draftModuleId}/lessons`, {
        method: "POST", token: teacherLogin.body.data.token,
        body: JSON.stringify({ title: "Draft lesson", type: "doc" }),
      },
    );
    assert.equal(addedLesson.status, 201);
    const draftLessonId = addedLesson.body.data[0]!.lessons[0]!.id;
    assert.equal((await api(server.baseUrl, `${draftPath}/modules/${draftModuleId}/lessons/${draftLessonId}`, {
      method: "PATCH", token: teacherLogin.body.data.token,
      body: JSON.stringify({ title: "Edited draft lesson" }),
    })).status, 200);
    const storedDraft = (await repositories.courses.findById(draft.body.data.id))!;
    assert.equal(storedDraft.modules[0]?.lessons[0]?.title, "Edited draft lesson");
    assert.equal(storedDraft.modules[0]?.lessons[0]?.createdBy, professor.id);
    assert.equal(storedDraft.modules[0]?.lessons[0]?.updatedBy, professor.id);
    assert.equal((await api(server.baseUrl, `${draftPath}/modules/${draftModuleId}/lessons/${draftLessonId}`, {
      method: "DELETE", token: teacherLogin.body.data.token,
    })).status, 200);
    assert.equal((await api(server.baseUrl, `${draftPath}/modules/${draftModuleId}`, {
      method: "DELETE", token: teacherLogin.body.data.token,
    })).status, 200);
    assert.equal((await api(server.baseUrl, `/api/admin/courses/${draft.body.data.id}`, {
      method: "DELETE", token: adminLogin.body.data.token,
    })).status, 204);
    assert.equal(await repositories.courses.findById(draft.body.data.id), null);
    await CourseModel.init();
    await assert.rejects(
      CourseModel.create({ ...(await repositories.courses.findById(courseId)), legacyId: courseId + 100 }),
      (error: unknown) => (error as { code?: number }).code === 11000,
    );
    const concurrent = await Promise.all([0, 1].map(() =>
      api<{ data: { id: number; slug: string } }>(server!.baseUrl, "/api/admin/courses", {
        method: "POST", token: adminLogin.body.data.token,
        body: JSON.stringify({ ...courseInput, title: "Concurrent Atlas Course" }),
      }),
    ));
    assert.deepEqual(concurrent.map((response) => response.status), [201, 201]);
    assert.equal(new Set(concurrent.map((response) => response.body.data.id)).size, 2);
    assert.equal(new Set(concurrent.map((response) => response.body.data.slug)).size, 2);
    const course = await repositories.courses.findById(courseId);
    assert.ok(course);
    assert.equal(course.professorEmail, "professor@example.test");
    const otherEnrollment = await repositories.enrollments.create({
      studentEmail: other.email, studentName: other.name,
      courseId: course.legacyId, status: "Activo",
    });
    assert.equal((await api(server.baseUrl, `/api/admin/courses/${courseId}`, {
      method: "DELETE", token: adminLogin.body.data.token,
    })).status, 400);
    assert.ok(await repositories.enrollments.findById(otherEnrollment.id));

    const studentLogin = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/login", {
      method: "POST", body: JSON.stringify({ email: student.email, password: studentPassword }),
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
    const resumed = await api<{ data: { order: { id: string } } }>(server.baseUrl, "/api/checkout", {
      method: "POST", body: JSON.stringify({
        courseSlug: course.slug, nombre: "Atlas Buyer", email: "buyer@example.test", dni: buyerDni,
      }),
    });
    assert.equal(resumed.status, 201);
    assert.equal(resumed.body.data.order.id, checkout.body.data.order.id);
    assert.equal((await repositories.orders.listVisibleForAdmin()).some(
      (order) => order.id === checkout.body.data.order.id), false);
    assert.equal(await repositories.conversations.findByStudentAndCourse(
      "buyer@example.test", course.legacyId), null);
    await EnrollmentModel.init();
    const simultaneous = await Promise.all([0, 1].map(() => api(server!.baseUrl, "/api/checkout", {
      method: "POST", body: JSON.stringify({
        courseSlug: course.slug, nombre: "Concurrent Buyer", email: "concurrent-buyer@example.test",
        dni: "27123456",
      }),
    })));
    assert.deepEqual(simultaneous.map((response) => response.status).sort(), [201, 400]);
    assert.equal((await mongoose.connection.db!.collection("orders").countDocuments({
      email: "concurrent-buyer@example.test",
    })), 1);
    assert.equal(await repositories.users.findByEmail("buyer@example.test"), null);
    const rawOrder = await mongoose.connection.db!.collection("orders").findOne({ id: checkout.body.data.order.id });
    assert.ok(rawOrder?.dniPasswordHash);
    const rollbackReference = "ATLAS-ROLLBACK-TEST";
    const sourceOrder = await repositories.orders.findByReference(checkout.body.data.order.id);
    assert.ok(sourceOrder);
    await assert.rejects(repositories.withTransaction(async () => {
      await repositories.orders.create({ ...sourceOrder, id: "ord_rollback_test",
        externalReference: rollbackReference, email: "rollback-atlas@example.test" });
      throw new Error("Injected failure after order write");
    }));
    assert.equal(await repositories.orders.findByReference(rollbackReference), null);
    assert.equal(rawOrder.dni, undefined);
    assert.notEqual(rawOrder.dniPasswordHash, buyerDni);
    const paid = await applyOrderTransition({
      reference: sourceOrder.externalReference, status: "Pagado", source: "mercadopago",
      providerEventId: "atlas-payment-approved", providerPaymentId: "123456789",
      paymentStatus: "approved", reason: "Mercado Pago confirmó el cobro en ensayo",
    });
    assert.ok(paid);
    assert.equal((await repositories.orders.listVisibleForAdmin()).filter(
      (order) => order.id === checkout.body.data.order.id).length, 1);
    const paymentEvents = await PaymentEventModel.find({ orderId: checkout.body.data.order.id }).lean().exec();
    assert.equal(paymentEvents.length, 1);
    assert.equal(paymentEvents[0]?.reason, "Mercado Pago confirmó el cobro en ensayo");
    assert.equal(paymentEvents[0]?.previousStatus, "Pendiente");
    assert.equal(paymentEvents[0]?.nextStatus, "Pagado");
    await PaymentEventModel.init();
    const firstNotification: StoredPaymentEvent = {
      id: "pev_unique_1", orderId: checkout.body.data.order.id, source: "mercadopago",
      providerEventId: "notification-unique-1", providerPaymentId: "123456789",
      previousStatus: "Pagado", nextStatus: "Pagado", reason: "Idempotency test",
      createdAt: new Date().toISOString(), paymentStatus: "approved",
    };
    await PaymentEventModel.create(firstNotification);
    await assert.rejects(PaymentEventModel.create({ ...firstNotification, id: "pev_unique_2" }),
      (error: unknown) => (error as { code?: number }).code === 11000);
    const buyer = await repositories.users.findByEmail("buyer@example.test");
    const rawBuyer = await mongoose.connection.db!.collection("users").findOne({ email: "buyer@example.test" });
    assert.equal(rawBuyer?.dni, undefined);
    assert.equal(buyer?.passwordHash, rawOrder.dniPasswordHash);
    assert.equal((await repositories.enrollments.findById(checkout.body.data.enrollment.id))?.status, "Activo");
    assert.ok((await repositories.enrollments.findById(checkout.body.data.enrollment.id))?.expiresAt);
    const buyerLogin = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/login", {
      method: "POST", body: JSON.stringify({ email: "buyer@example.test", password: buyerDni }),
    });
    assert.equal(buyerLogin.status, 200);
    const progressPath = `/api/student/enrollments/${checkout.body.data.enrollment.id}/progress`;
    const markLesson = () => api<{ data: { progress: number } }>(server!.baseUrl, progressPath, {
      method: "PATCH", token: buyerLogin.body.data.token,
      body: JSON.stringify({ lessonId: "1.1", completed: true }),
    });
    assert.equal((await markLesson()).body.data.progress, 100);
    assert.equal((await markLesson()).body.data.progress, 100);
    assert.deepEqual(
      (await repositories.enrollments.findById(checkout.body.data.enrollment.id))?.completedLessonIds,
      ["1.1"],
    );
    await EnrollmentModel.init();
    const persisted = await repositories.enrollments.findById(checkout.body.data.enrollment.id);
    assert.ok(persisted);
    await assert.rejects(
      EnrollmentModel.create({ ...persisted, id: "enr_duplicate_atlas" }),
      (error: unknown) => (error as { code?: number }).code === 11000,
    );
    const suspended = await api(server.baseUrl, `/api/admin/users/${student.id}`, {
      method: "PATCH", token: adminLogin.body.data.token, body: JSON.stringify({ status: "Suspendido" }),
    });
    assert.equal(suspended.status, 200);
    assert.equal((await api(server.baseUrl, "/api/auth/session", { token: studentToken })).status, 401);
    assert.equal((await repositories.users.findById(student.id))?.sessionVersion, 1);
  } finally {
    setPaymentGatewayForTests(null);
    await server?.close();
    if (mongoose.connection.db?.databaseName === databaseName) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  }
});
