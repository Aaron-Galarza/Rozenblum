import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import mongoose from "mongoose";
import { BRAND_HERO_URL } from "@rozenblum/shared";
import { env } from "../config/env.js";
import { hashPassword } from "../lib/password.js";
import { ContactModel, ConversationModel, CourseArchiveModel, CourseModel, EnrollmentModel, HomeContentModel, OrderModel, PaymentEventModel } from "../models/index.js";
import { archiveExpiredCourse } from "../services/course-archive.js";
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
      expiresOn: "2099-12-31",
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
    await ConversationModel.create({
      id: "cnv_discarded_atlas", courseId: draft.body.data.id,
      studentEmail: "orphan@example.test", studentName: "Orphan",
      teacherEmail: professor.email, teacherName: professor.name, messages: [],
    });
    assert.equal((await api(server.baseUrl, `/api/admin/courses/${draft.body.data.id}`, {
      method: "DELETE", token: adminLogin.body.data.token,
    })).status, 204);
    assert.equal(await repositories.courses.findById(draft.body.data.id), null);
    assert.equal(await ConversationModel.countDocuments({ courseId: draft.body.data.id }), 0);
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
    // Both participants may open an empty conversation at the same instant.
    const studentChatPath = `/api/student/enrollments/${checkout.body.data.enrollment.id}/messages`;
    const teacherChatPath = `/api/teacher/courses/${courseId}/students/${checkout.body.data.enrollment.id}/messages`;
    await ConversationModel.init();
    const parallelMessages = await Promise.all([
      api(server.baseUrl, studentChatPath, {
        method: "POST", token: buyerLogin.body.data.token,
        body: JSON.stringify({ text: "Pregunta simultánea" }),
      }),
      api(server.baseUrl, teacherChatPath, {
        method: "POST", token: teacherLogin.body.data.token,
        body: JSON.stringify({ text: "Respuesta simultánea" }),
      }),
    ]);
    assert.deepEqual(parallelMessages.map((response) => response.status), [201, 201]);
    assert.equal(await ConversationModel.countDocuments({ studentEmail: "buyer@example.test", courseId }), 1);
    const chatPage = await api<{ data: { from: string; text: string }[] }>(
      server.baseUrl, `${studentChatPath}?limit=1&offset=0`, { token: buyerLogin.body.data.token },
    );
    assert.equal(chatPage.status, 200);
    assert.equal(chatPage.body.data.length, 1);
    assert.equal(chatPage.headers.get("x-total-count"), "2");
    const olderPage = await api<{ data: { from: string; text: string }[] }>(
      server.baseUrl, `${studentChatPath}?limit=1&offset=1`, { token: buyerLogin.body.data.token },
    );
    assert.equal(olderPage.body.data.length, 1);
    assert.notEqual(olderPage.body.data[0]?.text, chatPage.body.data[0]?.text);
    const teacherView = await api<{ data: { from: string; text: string }[] }>(
      server.baseUrl, teacherChatPath, { token: teacherLogin.body.data.token },
    );
    assert.equal(teacherView.status, 200);
    assert.equal(teacherView.body.data.find((message) => message.text === "Respuesta simultánea")?.from, "me");
    // The database filter must arbitrate concurrent writers at the daily boundary.
    await ConversationModel.updateOne({ studentEmail: "buyer@example.test", courseId }, {
      $push: { messages: { $each: Array.from({ length: 97 }, (_, index) => ({
        id: `msg_daily_atlas_${index}`, authorEmail: "buyer@example.test",
        authorRole: "alumno", text: `Previous message ${index}`,
        time: "Tú · 12:00", createdAt: new Date().toISOString(),
      })) } },
    });
    const boundary = await Promise.all([
      api(server.baseUrl, studentChatPath, {
        method: "POST", token: buyerLogin.body.data.token,
        body: JSON.stringify({ text: "Daily boundary student" }),
      }),
      api(server.baseUrl, teacherChatPath, {
        method: "POST", token: teacherLogin.body.data.token,
        body: JSON.stringify({ text: "Daily boundary teacher" }),
      }),
    ]);
    assert.deepEqual(boundary.map((result) => result.status).sort(), [201, 429]);
    assert.equal((await ConversationModel.findOne({ studentEmail: "buyer@example.test", courseId }).lean())?.messages.length, 100);
    const foreignProfessor = await repositories.users.create({
      name: "Foreign Professor", email: "foreign-professor@example.test", role: "profesor",
      initials: "FP", passwordHash: await hashPassword(adminPassword),
    });
    const foreignLogin = await api<{ data: { token: string } }>(server.baseUrl, "/api/auth/login", {
      method: "POST", body: JSON.stringify({ email: foreignProfessor.email, password: adminPassword }),
    });
    assert.equal(foreignLogin.status, 200);
    assert.equal((await api(server.baseUrl, teacherChatPath, {
      token: foreignLogin.body.data.token,
    })).status, 403);
    assert.equal((await api(server.baseUrl, teacherChatPath, {
      method: "POST", token: foreignLogin.body.data.token,
      body: JSON.stringify({ text: "Unauthorized message" }),
    })).status, 403);

    // Database aggregation, not a truncated list, must drive dashboard totals.
    const beforeMetrics = await repositories.orders.metrics();
    const bulkTime = "2100-01-01T00:00:00.000Z";
    await OrderModel.insertMany(Array.from({ length: 1001 }, (_, index) => ({
      id: `ord_bulk_${index}`, externalReference: `RB-BULK-${index}`,
      alumno: index === 0 ? "=2+2" : `Bulk Buyer ${index}`,
      email: `bulk-${index}@example.test`,
      curso: course.title, courseSlug: course.slug, courseId,
      monto: "$ 100", montoCents: 10000, fecha: "01/01/2100",
      metodo: "Mercado Pago", estado: "Pagado", createdAt: bulkTime,
      paymentProvider: "mercadopago", paymentId: `bulk-payment-${index}`,
    })), { ordered: false });
    await OrderModel.create({
      id: "ord_bulk_unverified", externalReference: "RB-BULK-UNVERIFIED",
      alumno: "Unverified Buyer", email: "unverified@example.test",
      curso: course.title, courseSlug: course.slug, courseId,
      monto: "$ 100", montoCents: 10000, fecha: "01/01/2100",
      metodo: "Mercado Pago", estado: "Pagado", createdAt: bulkTime,
      paymentProvider: "mercadopago",
    });
    const afterMetrics = await repositories.orders.metrics();
    assert.equal(afterMetrics.paidCount - beforeMetrics.paidCount, 1001);
    assert.equal(afterMetrics.paidCents - beforeMetrics.paidCents, 10_010_000);
    const overview = await api<{ data: { dashboard: { totalIngresos: string; orders: unknown[] } } }>(
      server.baseUrl, "/api/admin/overview?limit=5", { token: adminLogin.body.data.token },
    );
    assert.equal(overview.status, 200);
    assert.ok(Number(overview.headers.get("x-total-orders")) >= 1002);
    assert.equal(overview.body.data.dashboard.orders.length, 5);
    const lastOrders = await api<{ data: { id: string }[] }>(
      server.baseUrl, "/api/admin/orders?limit=5&offset=1000", { token: adminLogin.body.data.token },
    );
    assert.equal(lastOrders.status, 200);
    assert.equal(lastOrders.body.data.length, 2);
    assert.ok(Number(lastOrders.headers.get("x-total-count")) >= 1002);
    const exportUrl = `${server.baseUrl}/api/admin/orders/export`;
    assert.equal((await fetch(exportUrl)).status, 401);
    assert.equal((await fetch(exportUrl, {
      headers: { authorization: `Bearer ${teacherLogin.body.data.token}` },
    })).status, 403);
    const exported = await fetch(exportUrl, {
      headers: { authorization: `Bearer ${adminLogin.body.data.token}` },
    });
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get("content-type") ?? "", /^text\/csv/);
    const csv = await exported.text();
    assert.equal(csv.split("\r\n").length - 2, 1002);
    assert.ok(csv.includes("\"'=2+2\""));
    assert.equal(csv.includes("RB-BULK-UNVERIFIED"), false);
    assert.equal(csv.includes("dniPasswordHash"), false);
    assert.equal(csv.includes(buyerDni), false);
    const enrollmentExport = await fetch(`${server.baseUrl}/api/admin/enrollments/export`, {
      headers: { authorization: `Bearer ${adminLogin.body.data.token}` },
    });
    assert.equal(enrollmentExport.status, 200);
    assert.ok((await enrollmentExport.text()).includes(checkout.body.data.enrollment.id));
    const beforeEnrollments = await repositories.enrollments.metrics();
    await EnrollmentModel.insertMany(Array.from({ length: 1001 }, (_, index) => ({
      id: `enr_bulk_${index}`, studentEmail: `enrolled-${index}@example.test`,
      studentName: `Bulk Student ${index}`, courseId, status: "Activo",
      startedAt: bulkTime, completedLessonIds: [],
    })), { ordered: false });
    const afterEnrollments = await repositories.enrollments.metrics();
    assert.equal(afterEnrollments.total - beforeEnrollments.total, 1001);
    assert.equal(afterEnrollments.activeStudents - beforeEnrollments.activeStudents, 1001);
    const enrollmentPage = await api<{ data: unknown[] }>(server.baseUrl,
      "/api/admin/enrollments?limit=5&offset=1000", { token: adminLogin.body.data.token });
    assert.equal(enrollmentPage.status, 200);
    assert.ok(Number(enrollmentPage.headers.get("x-total-count")) > 1000);
    assert.equal(enrollmentPage.body.data.length,
      Math.min(5, Number(enrollmentPage.headers.get("x-total-count")) - 1000));
    const teacherDashboard = await api<{ data: { courses: { id: number; students: number }[] } }>(
      server.baseUrl, "/api/teacher/dashboard", { token: teacherLogin.body.data.token },
    );
    assert.equal(teacherDashboard.status, 200);
    assert.ok((teacherDashboard.body.data.courses.find((item) => item.id === courseId)?.students ?? 0) > 1000);
    const teacherStudents = await api<{ data: unknown[] }>(server.baseUrl,
      `/api/teacher/courses/${courseId}/students`, { token: teacherLogin.body.data.token });
    assert.equal(teacherStudents.status, 200);
    assert.ok(teacherStudents.body.data.length > 1000);
    const teacherEnrollments = await api<{ data: unknown[] }>(server.baseUrl,
      `/api/teacher/courses/${courseId}/enrollments`, { token: teacherLogin.body.data.token });
    assert.equal(teacherEnrollments.status, 200);
    assert.equal(teacherEnrollments.body.data.length, teacherStudents.body.data.length);
    await OrderModel.create({
      id: "ord_month_boundary", externalReference: "RB-MONTH-BOUNDARY",
      alumno: "Month Boundary", email: "month-boundary@example.test",
      curso: course.title, courseSlug: course.slug, courseId,
      monto: "$ 100", montoCents: 10000, fecha: "01/01/2020",
      metodo: "Manual", estado: "Pagado", createdAt: "2020-01-31T23:00:00.000Z",
      paymentProvider: "manual",
    });
    await PaymentEventModel.create({
      id: "pev_month_boundary", orderId: "ord_month_boundary", source: "manual",
      previousStatus: "Pendiente", nextStatus: "Pagado", actorId: "test-admin",
      reason: "Confirmación en otro mes", createdAt: "2020-02-01T01:00:00.000Z",
    });
    const revenueByMonth = new Map((await repositories.orders.metrics()).paidMonthly
      .map((row) => [row.month, row.cents]));
    assert.equal(revenueByMonth.get("2020-02"), 10000);
    assert.equal(revenueByMonth.get("2020-01") ?? 0, 0);
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
    const buyerAccount = await repositories.users.findByEmail("buyer@example.test");
    assert.ok(buyerAccount);
    const closed = await api(server.baseUrl, `/api/admin/users/${buyerAccount.id}?reason=Solicitud%20de%20baja%20de%20prueba`, {
      method: "DELETE", token: adminLogin.body.data.token,
    });
    assert.equal(closed.status, 204);
    assert.ok((await repositories.users.findById(buyerAccount.id))?.deletedAt);
    assert.equal((await api(server.baseUrl, "/api/auth/session", { token: buyerLogin.body.data.token })).status, 401);
    assert.ok(await repositories.orders.findByReference(sourceOrder.externalReference));
    assert.ok(await repositories.enrollments.findById(checkout.body.data.enrollment.id));
    assert.ok(await repositories.conversations.findByStudentAndCourse("buyer@example.test", courseId));
    const expiredCourse = await repositories.courses.create({
      title: "Archived Atlas Course", description: "Archive transaction test",
      priceCents: 10_000, duration: "Online", level: "Inicial", status: "published",
      professor: professor.name, professorEmail: professor.email,
      img: "https://example.test/archive.jpg", expiresOn: "2020-01-01",
    });
    const expiredEnrollment = await repositories.enrollments.create({
      studentEmail: "archived@example.test", studentName: "Archived Student",
      courseId: expiredCourse.legacyId, status: "Completado",
    });
    await ConversationModel.create({
      id: "cnv_archive_atlas", courseId: expiredCourse.legacyId,
      studentEmail: "archived@example.test", studentName: "Archived Student",
      teacherEmail: professor.email, teacherName: professor.name, messages: [],
    });
    await CourseArchiveModel.init();
    assert.equal(await archiveExpiredCourse(expiredCourse.legacyId), "archived");
    assert.equal(await repositories.courses.findById(expiredCourse.legacyId), null);
    assert.equal(await repositories.enrollments.findById(expiredEnrollment.id), null);
    assert.equal(await ConversationModel.countDocuments({ courseId: expiredCourse.legacyId }), 0);
    assert.equal((await repositories.courseArchives.findByCourseId(expiredCourse.legacyId))?.enrollmentCount, 1);
    const audit = await api<{ data: { entityId: string; reason: string; previousState?: unknown }[] }>(
      server.baseUrl, "/api/admin/audit?entity=user", { token: adminLogin.body.data.token },
    );
    assert.ok(audit.body.data.some((event) => event.entityId === buyerAccount.id &&
      event.reason === "Solicitud de baja de prueba" && Boolean(event.previousState)));
  } finally {
    setPaymentGatewayForTests(null);
    await server?.close();
    if (mongoose.connection.db?.databaseName === databaseName) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  }
});
