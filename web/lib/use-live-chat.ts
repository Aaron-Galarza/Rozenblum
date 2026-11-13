"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageDTO } from "@rozenblum/shared";
import { apiFetch, CHAT_SOCKET_URL, errorMessage, getSession, SESSION_CHANGED } from "./api";

const SUBSCRIPTION_TIMEOUT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const HEARTBEAT_TIMEOUT_MS = 8_000;
const OFFLINE_REFRESH_MS = 10_000;
const LIVE_RECONCILE_MS = 30_000;

function sameMessages(current: ChatMessageDTO[], next: ChatMessageDTO[]) {
  return current.length === next.length && current.every((message, index) =>
    message.id === next[index]?.id && message.text === next[index]?.text &&
    message.from === next[index]?.from && message.time === next[index]?.time &&
    message.authorName === next[index]?.authorName &&
    message.authorRole === next[index]?.authorRole);
}

function mergeMessages(current: ChatMessageDTO[], incoming: ChatMessageDTO[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  const merged = [...byId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(-500);
  return sameMessages(current, merged) ? current : merged;
}

/** Receive change signals over WebSocket; reads and writes keep using the HTTP API. */
export function useLiveChat(path: string | null) {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "offline">("offline");
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
    setConnectionState(path ? "connecting" : "offline");
    if (!path) return;

    let active = true;
    let reading = false;
    let refreshPending = false;
    const refresh = async () => {
      if (!active) return;
      if (reading || sendingNow.current) { refreshPending = true; return; }
      reading = true;
      const readVersion = version.current;
      try {
        const next = await apiFetch<ChatMessageDTO[]>(path, { auth: true, cache: "no-store" });
        if (active && activePath.current === path && version.current === readVersion) {
          setMessages((current) => mergeMessages(current, next));
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
    let subscriptionTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let pongTimer: number | null = null;
    let live = false;
    let retryCount = 0;
    const clearSubscriptionTimer = () => {
      if (subscriptionTimer !== null) window.clearTimeout(subscriptionTimer);
      subscriptionTimer = null;
    };
    const stopHeartbeat = () => {
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      if (pongTimer !== null) window.clearTimeout(pongTimer);
      heartbeatTimer = null;
      pongTimer = null;
    };
    const startHeartbeat = (connectedSocket: WebSocket) => {
      stopHeartbeat();
      heartbeatTimer = window.setInterval(() => {
        if (!active || socket !== connectedSocket || connectedSocket.readyState !== WebSocket.OPEN) return;
        if (pongTimer !== null) return;
        connectedSocket.send(JSON.stringify({ type: "ping" }));
        pongTimer = window.setTimeout(() => {
          forceDisconnect(connectedSocket);
        }, HEARTBEAT_TIMEOUT_MS);
      }, HEARTBEAT_INTERVAL_MS);
    };
    const connect = () => {
      if (!active) return;
      const token = getSession()?.token;
      if (!token) { setConnectionState("offline"); return; }
      live = false;
      setConnectionState("connecting");
      try {
        socket = new WebSocket(CHAT_SOCKET_URL);
      } catch {
        setConnectionState("offline");
        scheduleReconnect();
        return;
      }
      const connectedSocket = socket;
      // A proxy can accept the upgrade without forwarding the subscription.
      // Do not leave the UI in "connecting" forever when no ready arrives.
      subscriptionTimer = window.setTimeout(() => {
        if (!live) forceDisconnect(connectedSocket);
      }, SUBSCRIPTION_TIMEOUT_MS);
      connectedSocket.onopen = () => {
        if (active && socket === connectedSocket) connectedSocket.send(JSON.stringify({ type: "subscribe", token, path }));
      };
      connectedSocket.onmessage = (event) => {
        if (!active || socket !== connectedSocket) return;
        try {
          const notice = JSON.parse(String(event.data)) as { type?: string; message?: ChatMessageDTO };
          if (notice.type === "ready") {
            clearSubscriptionTimer();
            live = true;
            retryCount = 0;
            setConnectionState("live");
            startHeartbeat(connectedSocket);
          }
          if (notice.type === "pong" && pongTimer !== null) {
            window.clearTimeout(pongTimer);
            pongTimer = null;
          }
          if (notice.type === "message" && notice.message?.id && typeof notice.message.text === "string") {
            setMessages((current) => mergeMessages(current, [notice.message!]));
            if (process.env.NODE_ENV === "development") console.debug("[chat] mensaje recibido en vivo");
          }
          if (notice.type === "ready" || notice.type === "refresh") void refresh();
          if (notice.type === "course_removed") window.location.reload();
        } catch { /* Ignore malformed notifications. */ }
      };
      connectedSocket.onclose = (event) => {
        if (socket !== connectedSocket) return;
        if (process.env.NODE_ENV === "development") console.debug("[chat] socket closed", event.code, event.reason);
        forceDisconnect(connectedSocket);
      };
      connectedSocket.onerror = () => forceDisconnect(connectedSocket);
    };
    const scheduleReconnect = () => {
      if (!active || reconnectTimer !== null) return;
      const delay = Math.min(1_000 * 2 ** Math.min(retryCount++, 5), 30_000);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };
    const forceDisconnect = (connectedSocket: WebSocket) => {
      if (socket !== connectedSocket) return;
      connectedSocket.onopen = connectedSocket.onmessage = connectedSocket.onclose = connectedSocket.onerror = null;
      socket = null;
      live = false;
      clearSubscriptionTimer();
      stopHeartbeat();
      connectedSocket.close();
      setConnectionState("offline");
      scheduleReconnect();
    };
    const onSessionChange = () => {
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close();
        socket = null;
      }
      clearSubscriptionTimer();
      stopHeartbeat();
      live = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      connect();
    };
    connect();
    // Only consult HTTP while the live channel is unavailable. A blocked
    // WebSocket still receives new messages without waiting for someone to send.
    const offlineRefreshTimer = window.setInterval(() => { if (!live) void refresh(); }, OFFLINE_REFRESH_MS);
    // A low-frequency read reconciles missed notifications when a proxy or
    // multiple API instances leave a socket apparently live.
    const reconcileTimer = window.setInterval(() => { if (live) void refresh(); }, LIVE_RECONCILE_MS);
    const onVisibility = () => { if (!document.hidden) void refresh(); };
    const onFocus = () => { void refresh(); };
    const onOnline = () => { if (!socket && reconnectTimer === null) connect(); void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener(SESSION_CHANGED, onSessionChange);
    return () => {
      active = false;
      activePath.current = null;
      version.current += 1;
      refreshNow.current = () => {};
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close();
        socket = null;
      }
      clearSubscriptionTimer();
      stopHeartbeat();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      window.clearInterval(offlineRefreshTimer);
      window.clearInterval(reconcileTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
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
        setMessages((current) => mergeMessages(current, next));
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
  return { messages, loading, sending, error, connectionState, sendMessage, retry };
}
