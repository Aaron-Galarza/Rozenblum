export const CHAT_DAILY_LIMIT = 100;

/** Argentina currently uses UTC−03:00; the window resets at local midnight. */
export function chatDayStartIso(iso: string): string {
  const localDay = new Date(Date.parse(iso) - 3 * 60 * 60_000).toISOString().slice(0, 10);
  return `${localDay}T03:00:00.000Z`;
}

export function chatDayEndIso(iso: string): string {
  return new Date(Date.parse(chatDayStartIso(iso)) + 24 * 60 * 60_000).toISOString();
}
