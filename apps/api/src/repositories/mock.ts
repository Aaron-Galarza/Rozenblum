import type { Repositories } from "./interfaces.js";
import { clone, createMemory, type Memory } from "./mock-memory.js";
import { createMockAccountsRepositories } from "./mock-accounts.js";
import { createMockCoursesRepositories } from "./mock-courses.js";
import { createMockPaymentsRepositories } from "./mock-payments.js";
import { createMockConversationsRepositories } from "./mock-conversations.js";
import { createMockContentRepositories } from "./mock-content.js";

export function createMockRepositories(initial: Partial<Memory> = {}): Repositories {
  const db = createMemory(initial);
  let previousTransaction: Promise<void> = Promise.resolve();

  const withTransaction = async <T>(work: () => Promise<T>): Promise<T> => {
    let release!: () => void;
    const completed = new Promise<void>((resolve) => { release = resolve; });
    const waitFor = previousTransaction;
    previousTransaction = completed;
    await waitFor;
    const before = clone(db);
    try {
      return await work();
    } catch (error) {
      Object.assign(db, before);
      throw error;
    } finally {
      release();
    }
  };

  const { users, enrollments } = createMockAccountsRepositories(db);
  const { courses } = createMockCoursesRepositories(db);
  const { orders, paymentEvents } = createMockPaymentsRepositories(db);
  const { conversations } = createMockConversationsRepositories(db);
  const { contacts, home } = createMockContentRepositories(db);

  return {
    mode: "test",
    withTransaction,
    users,
    courses,
    enrollments,
    orders,
    paymentEvents,
    conversations,
    contacts,
    home,
  };
}
