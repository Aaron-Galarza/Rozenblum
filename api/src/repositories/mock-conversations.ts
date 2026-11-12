import type { StoredMessage } from "../types.js";
import type { ConversationRepository } from "./interfaces.js";
import { clone, type Memory } from "./mock-memory.js";

export function createMockConversationsRepositories(db: Memory) {
  const conversations: ConversationRepository = {
    async listByTeacher(email) {
      return db.conversations
        .filter((c) => c.teacherEmail.toLowerCase() === email.toLowerCase())
        .map(clone);
    },
    async findById(id) {
      const conversation = db.conversations.find((c) => c.id === id);
      return conversation ? clone(conversation) : null;
    },
    async findByStudentAndCourse(email, courseId) {
      const conversation = db.conversations.find(
        (c) => c.studentEmail.toLowerCase() === email.toLowerCase() && c.courseId === courseId,
      );
      return conversation ? clone(conversation) : null;
    },
    async create(input) {
      if (db.conversations.some((item) =>
        item.studentEmail === input.studentEmail.toLowerCase() && item.courseId === input.courseId)) {
        throw Object.assign(new Error("Conversación duplicada."), { code: 11000 });
      }
      db.conversations.push(clone(input));
      return clone(input);
    },
    async addMessage(id, message: StoredMessage) {
      const conversation = db.conversations.find((c) => c.id === id);
      if (!conversation) return false;
      conversation.messages.push(clone(message));
      return true;
    },
    async listMessages(id, page) {
      const conversation = db.conversations.find((c) => c.id === id);
      if (!conversation) return null;
      const total = conversation.messages.length;
      const limit = page?.limit ?? 500;
      const offset = page?.offset ?? 0;
      const start = Math.max(total - offset - limit, 0);
      return {
        messages: conversation.messages.slice(start, start + limit).map(clone),
        total,
      };
    },
    async reassignTeacher(courseId, teacherEmail, teacherName) {
      let changed = 0;
      for (const conversation of db.conversations) {
        if (conversation.courseId !== courseId) continue;
        conversation.teacherEmail = teacherEmail.toLowerCase();
        conversation.teacherName = teacherName;
        changed += 1;
      }
      return changed;
    },
    async deleteByStudent(email) {
      const before = db.conversations.length;
      db.conversations = db.conversations.filter(
        (c) => c.studentEmail.toLowerCase() !== email.toLowerCase(),
      );
      return before - db.conversations.length;
    },
  };
  return { conversations };
}
