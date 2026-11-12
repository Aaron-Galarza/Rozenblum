type ChatListener = (courseId: number, studentEmail: string) => void;

const listeners = new Set<ChatListener>();

export function onChatChanged(listener: ChatListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishChatChanged(courseId: number, studentEmail: string): void {
  for (const listener of listeners) listener(courseId, studentEmail.toLowerCase());
}
