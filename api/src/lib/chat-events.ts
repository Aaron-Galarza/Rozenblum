type ChatListener = (courseId: number, studentEmail: string) => void;
type CourseListener = (courseId: number) => void;

const listeners = new Set<ChatListener>();
const courseListeners = new Set<CourseListener>();

export function onChatChanged(listener: ChatListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishChatChanged(courseId: number, studentEmail: string): void {
  for (const listener of listeners) {
    try { listener(courseId, studentEmail.toLowerCase()); } catch { /* Persistence already succeeded. */ }
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
