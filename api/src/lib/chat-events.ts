import type { StoredConversation, StoredMessage } from "../types.js";

type ChatListener = (conversation: StoredConversation, message: StoredMessage) => void;
type CourseListener = (courseId: number) => void;

const listeners = new Set<ChatListener>();
const courseListeners = new Set<CourseListener>();

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
