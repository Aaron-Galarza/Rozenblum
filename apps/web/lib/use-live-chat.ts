"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageDTO } from "@rozenblum/shared";
import { apiFetch, errorMessage } from "./api";

const REFRESH_MS = 3_000;

function sameMessages(current: ChatMessageDTO[], next: ChatMessageDTO[]) {
  return current.length === next.length && current.every((message, index) =>
    message.id === next[index]?.id && message.text === next[index]?.text &&
    message.from === next[index]?.from && message.time === next[index]?.time);
}

/** Poll only the visible conversation, and ignore reads started before a send. */
export function useLiveChat(path: string | null) {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const activePath = useRef<string | null>(null);
  const version = useRef(0);
  const sendingNow = useRef(false);
  const refreshNow = useRef<() => void>(() => {});

  useEffect(() => {
    activePath.current = path;
    version.current += 1;
    sendingNow.current = false;
    setMessages([]);
    setLoading(Boolean(path));
    setSending(false);
    setError("");
    if (!path) return;

    let active = true;
    let reading = false;
    const refresh = async () => {
      if (!active || reading || sendingNow.current || document.hidden) return;
      reading = true;
      const readVersion = version.current;
      try {
        const next = await apiFetch<ChatMessageDTO[]>(path, { auth: true });
        if (active && activePath.current === path && version.current === readVersion) {
          setMessages((current) => sameMessages(current, next) ? current : next);
          setError("");
        }
      } catch (cause) {
        if (active && activePath.current === path && version.current === readVersion) {
          setError(errorMessage(cause));
        }
      } finally {
        reading = false;
        if (active && activePath.current === path) setLoading(false);
      }
    };
    refreshNow.current = () => { void refresh(); };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    const onVisibility = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      activePath.current = null;
      version.current += 1;
      refreshNow.current = () => {};
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [path]);

  const sendMessage = useCallback(async (text: string) => {
    if (!path || sendingNow.current) return false;
    sendingNow.current = true;
    setSending(true);
    const sendVersion = ++version.current;
    try {
      const next = await apiFetch<ChatMessageDTO[]>(path, {
        method: "POST", auth: true, body: { text },
      });
      if (activePath.current === path && version.current === sendVersion) {
        setMessages(next);
        setError("");
        return true;
      }
      return false;
    } catch (cause) {
      if (activePath.current === path && version.current === sendVersion) {
        setError(errorMessage(cause));
      }
      throw cause;
    } finally {
      if (activePath.current === path && version.current === sendVersion) {
        sendingNow.current = false;
        setSending(false);
      }
    }
  }, [path]);

  const retry = useCallback(() => refreshNow.current(), []);
  return { messages, loading, sending, error, sendMessage, retry };
}
