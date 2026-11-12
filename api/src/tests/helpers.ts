import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApp } from "../app.js";
import { attachChatWebSocket } from "../lib/chat-websocket.js";

export type TestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startTestServer(): Promise<TestServer> {
  const app = createApp();
  const server = app.listen(0);
  const closeChat = attachChatWebSocket(server);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        closeChat();
        server.close(() => resolve());
      }),
  };
}

export type ApiResult<T> = { status: number; body: T; headers: Headers };

export async function api<T = unknown>(
  baseUrl: string,
  path: string,
  init?: RequestInit & { token?: string },
): Promise<ApiResult<T>> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (init?.token) headers.set("authorization", `Bearer ${init.token}`);

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : (undefined as T);
  return { status: response.status, body, headers: response.headers };
}
