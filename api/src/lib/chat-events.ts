import type { StoredConversation, StoredMessage } from "../types.js";

type ChatListener = (conversation: StoredConversation, message: StoredMessage) => void;
type CourseListener = (courseId: number) => void;
export type ChatAccessChange =
  | { kind: "course"; courseId: number }
  | { kind: "user"; userId: string }
  | { kind: "room"; courseId: number; studentEmail: string };
type AccessListener = (change: ChatAccessChange) => void;

const listeners = new Set<ChatListener>();
const courseListeners = new Set<CourseListener>();
const accessListeners = new Set<AccessListener>();

export function onChatChanged(listener: ChatListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishChatChanged(conversation: StoredConversation, message: StoredMessage): void {
  for (const listener of listeners) {
    try { listener(conversation, message); } catch { /* Persistence already succeeded. */ }
  }
}

export function onCourseRemoved(listener: CourseListener): () => void {
  courseListeners.add(listener);
  return () => { courseListeners.delete(listener); };
}

export function publishCourseRemoved(courseId: number): void {
  for (const listener of courseListeners) {
    try { listener(courseId); } catch { /* The archive transaction already committed. */ }
  }
}

/** Close affected local subscriptions immediately after an access change commits. */
export function onChatAccessChanged(listener: AccessListener): () => void {
  accessListeners.add(listener);
  return () => { accessListeners.delete(listener); };
}

export function publishChatAccessChanged(change: ChatAccessChange): void {
  for (const listener of accessListeners) {
    try { listener(change); } catch { /* The database change has already committed. */ }
  }
}
