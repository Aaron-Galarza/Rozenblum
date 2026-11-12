"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageDTO } from "@rozenblum/shared";
import { apiFetch, CHAT_SOCKET_URL, errorMessage, getSession, SESSION_CHANGED } from "./api";

function sameMessages(current: ChatMessageDTO[], next: ChatMessageDTO[]) {
  return current.length === next.length && current.every((message, index) =>
    message.id === next[index]?.id && message.text === next[index]?.text &&
    message.from === next[index]?.from && message.time === next[index]?.time);
}

/** Receive change signals over WebSocket; reads and writes keep using the HTTP API. */
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
    let refreshPending = false;
    const refresh = async () => {
      if (!active || document.hidden) return;
      if (reading || sendingNow.current) { refreshPending = true; return; }
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
        if (refreshPending && !sendingNow.current) {
          refreshPending = false;
          void refresh();
        }
      }
    };
    refreshNow.current = () => { void refresh(); };
    void refresh();
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let retryCount = 0;
    const connect = () => {
      if (!active) return;
      const token = getSession()?.token;
      if (!token) return;
      try {
        socket = new WebSocket(CHAT_SOCKET_URL);
      } catch {
        scheduleReconnect();
        return;
      }
      const connectedSocket = socket;
      connectedSocket.onopen = () => connectedSocket.send(JSON.stringify({ type: "subscribe", token, path }));
      connectedSocket.onmessage = (event) => {
        try {
          const notice = JSON.parse(String(event.data)) as { type?: string };
          if (notice.type === "ready") retryCount = 0;
          if (notice.type === "ready" || notice.type === "refresh") void refresh();
          if (notice.type === "course_removed") window.location.reload();
        } catch { /* Ignore malformed notifications. */ }
      };
      connectedSocket.onclose = () => {
        if (socket !== connectedSocket) return;
        socket = null;
        scheduleReconnect();
      };
      connectedSocket.onerror = () => connectedSocket.close();
    };
    const scheduleReconnect = () => {
      if (!active || reconnectTimer !== null) return;
      const delay = Math.min(1_000 * 2 ** Math.min(retryCount++, 5), 30_000);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };
    const onSessionChange = () => {
      if (socket) { socket.onclose = null; socket.close(); socket = null; }
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      connect();
    };
    connect();
    const onVisibility = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(SESSION_CHANGED, onSessionChange);
    return () => {
      active = false;
      activePath.current = null;
      version.current += 1;
      refreshNow.current = () => {};
      socket?.close();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(SESSION_CHANGED, onSessionChange);
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
        refreshNow.current();
      }
    }
  }, [path]);

  const retry = useCallback(() => refreshNow.current(), []);
  return { messages, loading, sending, error, sendMessage, retry };
}
