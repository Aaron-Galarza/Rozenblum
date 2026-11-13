import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { verifyToken } from "./token.js";
import { onChatChanged, onCourseRemoved } from "./chat-events.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredUser } from "../types.js";
import { assertEnrollmentAccess, loadEnrollment } from "../services/classroom.js";
import { loadManagedCourse } from "../services/courses.js";
import { conversationToMessages } from "../services/mappers.js";

const SOCKET_PATH = "/api/chat/socket";
const STUDENT_PATH = /^\/api\/student\/enrollments\/(enr_[a-zA-Z0-9_-]+)\/messages$/;
const TEACHER_PATH = /^\/api\/teacher\/courses\/([1-9]\d*)\/students\/(enr_[a-zA-Z0-9_-]+)\/messages$/;

async function authenticatedUser(token: string): Promise<StoredUser | null> {
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = await getRepositories().users.findById(payload.sub);
  return user?.status === "Activo" && user.role === payload.role &&
    user.email.toLowerCase() === payload.email.toLowerCase() &&
    (user.sessionVersion ?? 0) === payload.ver ? user : null;
}

async function authorizedRoom(user: StoredUser, path: string): Promise<string | null> {
  const student = STUDENT_PATH.exec(path);
  if (student && user.role === "alumno") {
    const enrollment = await loadEnrollment(student[1], user);
    assertEnrollmentAccess(enrollment, { expired: "Acceso vencido", denied: "Acceso denegado" });
    return `${enrollment.courseId}:${enrollment.studentEmail.toLowerCase()}`;
  }
  const teacher = TEACHER_PATH.exec(path);
  if (teacher && (user.role === "profesor" || user.role === "admin")) {
    const courseId = Number(teacher[1]);
    if (!Number.isSafeInteger(courseId)) return null;
    await loadManagedCourse(courseId, user);
    const enrollment = await getRepositories().enrollments.findById(teacher[2]);
    if (!enrollment || enrollment.courseId !== courseId) return null;
    assertEnrollmentAccess(enrollment, { expired: "Acceso vencido", denied: "Acceso denegado" });
    return `${courseId}:${enrollment.studentEmail.toLowerCase()}`;
  }
  return null;
}

type Subscription = { token: string; path: string; room: string; user: StoredUser };

/** Deliver persisted chat messages to authorized subscribers on the same HTTP server. */
export function attachChatWebSocket(server: Server): () => void {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 8_192, perMessageDeflate: false });
  const subscriptions = new Map<WebSocket, Subscription>();
  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url !== SOCKET_PATH) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!request.headers.origin || !env.corsOrigins.includes(request.headers.origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client));
  };
  server.on("upgrade", onUpgrade);

  const alive = new WeakMap<WebSocket, boolean>();
  sockets.on("connection", (client: WebSocket) => {
    alive.set(client, true);
    client.on("pong", () => alive.set(client, true));
    client.on("error", () => client.terminate());
    const timeout = setTimeout(() => client.close(1008, "Suscripción requerida"), 5_000);
    let subscribing = false;
    client.on("message", (raw, binary) => {
      if (binary || subscribing) {
        client.close(1008, "Suscripción inválida");
        return;
      }
      let input: unknown;
      try { input = JSON.parse(raw.toString()); } catch { client.close(1008, "Datos inválidos"); return; }
      if (subscriptions.has(client)) {
        if (input && typeof input === "object" && !Array.isArray(input) &&
          Object.keys(input).length === 1 && (input as { type?: unknown }).type === "ping") {
          client.send(JSON.stringify({ type: "pong" }));
        } else {
          client.close(1008, "Mensaje inválido");
        }
        return;
      }
      subscribing = true;
      void (async () => {
        if (!input || typeof input !== "object" ||
          (input as { type?: unknown }).type !== "subscribe" ||
          typeof (input as { token?: unknown }).token !== "string" ||
          typeof (input as { path?: unknown }).path !== "string") {
          client.close(1008, "Suscripción inválida"); return;
        }
        const { token, path } = input as { token: string; path: string };
        const user = await authenticatedUser(token);
        const room = user && await authorizedRoom(user, path);
        if (!room || client.readyState !== WebSocket.OPEN) {
          client.close(1008, "Acceso denegado"); return;
        }
        clearTimeout(timeout);
        subscriptions.set(client, { token, path, room, user: user! });
        subscribing = false;
        client.send(JSON.stringify({ type: "ready" }));
        logger.debug("chat_ws_subscribed", { role: user!.role, subscribers: subscriptions.size });
      })().catch(() => client.close(1011, "No se pudo suscribir"));
    });
    client.on("close", (code) => {
      clearTimeout(timeout);
      subscriptions.delete(client);
      logger.debug("chat_ws_closed", { code, subscribers: subscriptions.size });
    });
  });
  const heartbeat = setInterval(() => {
    for (const client of sockets.clients) {
      if (!alive.get(client)) { client.terminate(); continue; }
      alive.set(client, false);
      client.ping();
    }
    for (const [client, subscription] of subscriptions) {
      void (async () => {
        const user = await authenticatedUser(subscription.token);
        const room = user && await authorizedRoom(user, subscription.path);
        if (room !== subscription.room && client.readyState === WebSocket.OPEN) {
          client.close(1008, "Acceso finalizado");
        }
      })().catch(() => client.close(1011, "No se pudo verificar el acceso"));
    }
  }, 15_000);
  heartbeat.unref();

  const unsubscribe = onChatChanged((conversation, message) => {
    const started = performance.now();
    const room = `${conversation.courseId}:${conversation.studentEmail.toLowerCase()}`;
    let targeted = 0;
    for (const [client, subscription] of subscriptions) {
      if (subscription.room !== room || client.readyState !== WebSocket.OPEN) continue;
      targeted += 1;
      if (!verifyToken(subscription.token)) { client.close(1008, "Sesión vencida"); continue; }
      const [item] = conversationToMessages({ ...conversation, messages: [message] }, subscription.user.email);
      client.send(JSON.stringify({ type: "message", message: item }));
    }
    logger.debug("chat_ws_change", { messageId: message.id, subscribers: targeted,
      durationMs: Math.round(performance.now() - started) });
  });
  const unsubscribeCourse = onCourseRemoved((courseId) => {
    for (const [client, subscription] of subscriptions) {
      if (!subscription.room.startsWith(`${courseId}:`) || client.readyState !== WebSocket.OPEN) continue;
      client.send(JSON.stringify({ type: "course_removed" }), () => client.close(1000, "Curso finalizado"));
    }
  });

  return () => {
    unsubscribe();
    unsubscribeCourse();
    clearInterval(heartbeat);
    server.off("upgrade", onUpgrade);
    for (const client of sockets.clients) client.terminate();
    sockets.close();
  };
}
