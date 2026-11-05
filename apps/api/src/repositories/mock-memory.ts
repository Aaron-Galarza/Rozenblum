import type { HomeContentDTO } from "@rozenblum/shared";
import type { StoredUser, StoredCourse, StoredEnrollment, StoredOrder, StoredPaymentEvent, StoredConversation, StoredSettings, StoredContact } from "../types.js";

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type Memory = {
  users: StoredUser[];
  courses: StoredCourse[];
  enrollments: StoredEnrollment[];
  orders: StoredOrder[];
  paymentEvents: StoredPaymentEvent[];
  conversations: StoredConversation[];
  settings: StoredSettings | null;
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
    settings: null,
    contacts: [],
    homeContent: null,
    ...clone(initial),
  };
}
