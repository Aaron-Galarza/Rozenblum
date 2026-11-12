import mongoose from "mongoose";
import type { Repositories } from "./interfaces.js";
import { createMongooseAccountsRepositories } from "./mongoose-accounts.js";
import { createMongooseCoursesRepositories } from "./mongoose-courses.js";
import { createMongooseCourseArchiveRepository } from "./mongoose-course-archives.js";
import { createMongoosePaymentsRepositories } from "./mongoose-payments.js";
import { createMongooseConversationsRepositories } from "./mongoose-conversations.js";
import { createMongooseContentRepositories } from "./mongoose-content.js";
import { createMongooseAdminEventRepository } from "./mongoose-admin-events.js";

export function createMongooseRepositories(): Repositories {
  mongoose.set("transactionAsyncLocalStorage", true);
  const { users, enrollments } = createMongooseAccountsRepositories();
  const { courses } = createMongooseCoursesRepositories();
  const { orders, paymentEvents } = createMongoosePaymentsRepositories();
  const { conversations } = createMongooseConversationsRepositories();
  const { contacts, home } = createMongooseContentRepositories();
  const { adminEvents } = createMongooseAdminEventRepository();

  return {
    mode: "atlas",
    withTransaction: (work) => mongoose.connection.transaction(work),
    users,
    courses,
    courseArchives: createMongooseCourseArchiveRepository(),
    enrollments,
    orders,
    paymentEvents,
    conversations,
    contacts,
    adminEvents,
    home,
  };
}
