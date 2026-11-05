import { ConversationModel } from "../models/index.js";
import { LIST_HARD_LIMIT } from "../lib/pagination.js";
import type { StoredConversation, StoredMessage } from "../types.js";
import type { ConversationRepository } from "./interfaces.js";
import { clean } from "./mongoose-common.js";

export function createMongooseConversationsRepositories() {
  const conversations: ConversationRepository = {
    async listAll() {
      const docs = await ConversationModel.find({}).limit(LIST_HARD_LIMIT).lean().exec();
      return docs.map((doc) => clean<StoredConversation>(doc));
    },
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
      const doc = await ConversationModel.findOneAndUpdate(
        { id },
        { $push: { messages: message } },
        { returnDocument: "after" },
      )
        .lean()
        .exec();
      return doc ? clean<StoredConversation>(doc) : null;
    },
    async reassignTeacher(courseId, teacherEmail, teacherName) {
      const result = await ConversationModel.updateMany(
        { courseId },
        { $set: { teacherEmail: teacherEmail.toLowerCase(), teacherName } },
      ).exec();
      return result.modifiedCount ?? 0;
    },
    async deleteByStudent(email) {
      const result = await ConversationModel.deleteMany({
        studentEmail: email.toLowerCase(),
      }).exec();
      return result.deletedCount ?? 0;
    },
  };
  return { conversations };
}
