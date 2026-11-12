import { ConversationModel } from "../models/index.js";
import { CHAT_DAILY_LIMIT, chatDayEndIso, chatDayStartIso } from "../lib/chat-limit.js";
import type { StoredConversation, StoredMessage } from "../types.js";
import type { ConversationRepository } from "./interfaces.js";
import { clean } from "./mongoose-common.js";

export function createMongooseConversationsRepositories() {
  const conversations: ConversationRepository = {
    async listByTeacher(email) {
      const docs = await ConversationModel.find({ teacherEmail: email.toLowerCase() })
        .lean()
        .exec();
      return docs.map((doc) => clean<StoredConversation>(doc));
    },
    async findById(id) {
      const doc = await ConversationModel.findOne({ id }).lean().exec();
      return doc ? clean<StoredConversation>(doc) : null;
    },
    async findByStudentAndCourse(email, courseId) {
      const doc = await ConversationModel.findOne({
        studentEmail: email.toLowerCase(),
        courseId,
      })
        .lean()
        .exec();
      return doc ? clean<StoredConversation>(doc) : null;
    },
    async create(input) {
      const doc = await ConversationModel.create(input);
      return clean<StoredConversation>(doc.toObject());
    },
    async addMessage(id, message: StoredMessage) {
      const dayStart = chatDayStartIso(message.createdAt);
      const dayEnd = chatDayEndIso(message.createdAt);
      const result = await ConversationModel.updateOne(
        { id, $expr: { $lt: [
          { $size: { $filter: {
            input: "$messages", as: "message",
            cond: { $and: [
              { $gte: ["$$message.createdAt", dayStart] },
              { $lt: ["$$message.createdAt", dayEnd] },
            ] },
          } } },
          CHAT_DAILY_LIMIT,
        ] } },
        { $push: { messages: message } },
      ).exec();
      if (result.matchedCount === 1) return "added";
      return await ConversationModel.exists({ id }) ? "limit" : "missing";
    },
    async listMessages(id, page) {
      const limit = page?.limit ?? 500;
      const offset = page?.offset ?? 0;
      const [doc] = await ConversationModel.aggregate<{
        total: number;
        messages: StoredMessage[];
      }>([
        { $match: { id } },
        {
          $project: {
            _id: 0,
            total: { $size: "$messages" },
            messages: {
              // Offset counts from the newest message, so page 0 is the tail.
              $slice: [
                "$messages",
                { $max: [{ $subtract: [{ $size: "$messages" }, offset + limit] }, 0] },
                limit,
              ],
            },
          },
        },
      ]).exec();
      return doc ? { messages: doc.messages, total: doc.total } : null;
    },
    async reassignTeacher(courseId, teacherEmail, teacherName) {
      const result = await ConversationModel.updateMany(
        { courseId },
        { $set: { teacherEmail: teacherEmail.toLowerCase(), teacherName } },
      ).exec();
      return result.modifiedCount ?? 0;
    },
    async deleteByCourse(courseId) {
      const result = await ConversationModel.deleteMany({ courseId }).exec();
      return result.deletedCount ?? 0;
    },
    async archiveSummary(courseId) {
      const [row] = await ConversationModel.aggregate<{
        conversationCount: number; messageCount: number;
      }>([
        { $match: { courseId } },
        { $group: { _id: null, conversationCount: { $sum: 1 },
          messageCount: { $sum: { $size: "$messages" } } } },
      ]).exec();
      return { conversationCount: row?.conversationCount ?? 0, messageCount: row?.messageCount ?? 0 };
    },
  };
  return { conversations };
}
