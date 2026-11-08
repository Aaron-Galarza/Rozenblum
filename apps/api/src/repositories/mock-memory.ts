import type { HomeContentDTO } from "@rozenblum/shared";
import type { StoredUser, StoredCourse, StoredEnrollment, StoredOrder, StoredPaymentEvent, StoredConversation, StoredContact } from "../types.js";

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type Memory = {
  users: StoredUser[];
  courses: StoredCourse[];
  enrollments: StoredEnrollment[];
  orders: StoredOrder[];
  paymentEvents: StoredPaymentEvent[];
  conversations: StoredConversation[];
  contacts: StoredContact[];
  homeContent: HomeContentDTO | null;
};

export function createMemory(initial: Partial<Memory>): Memory {
  return {
    users: [],
    courses: [],
    enrollments: [],
    orders: [],
    paymentEvents: [],
    conversations: [],
    contacts: [],
    homeContent: null,
    ...clone(initial),
  };
}
