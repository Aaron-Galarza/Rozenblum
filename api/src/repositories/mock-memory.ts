import type { HomeContentDTO } from "@rozenblum/shared";
import type { StoredUser, StoredCourse, StoredCourseArchive, StoredEnrollment, StoredOrder, StoredPaymentEvent, StoredConversation, StoredContact, StoredAdminEvent } from "../types.js";

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type Memory = {
  users: StoredUser[];
  courses: StoredCourse[];
  courseArchives: StoredCourseArchive[];
  enrollments: StoredEnrollment[];
  orders: StoredOrder[];
  paymentEvents: StoredPaymentEvent[];
  conversations: StoredConversation[];
  contacts: StoredContact[];
  adminEvents: StoredAdminEvent[];
  homeContent: HomeContentDTO | null;
};

export function createMemory(initial: Partial<Memory>): Memory {
  return {
    users: [],
    courses: [],
    courseArchives: [],
    enrollments: [],
    orders: [],
    paymentEvents: [],
    conversations: [],
    contacts: [],
    adminEvents: [],
    homeContent: null,
    ...clone(initial),
  };
}
