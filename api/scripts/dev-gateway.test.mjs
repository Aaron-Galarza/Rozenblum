import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { WebSocket, WebSocketServer } from "ws";
import { createDevGateway } from "./dev-gateway.mjs";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

function notice(client, expectedType) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`No llegó ${expectedType}`)), 2_000);
    client.once("message", (raw) => {
      clearTimeout(timeout);
      const message = JSON.parse(String(raw));
      try { assert.equal(message.type, expectedType); resolve(message); }
      catch (error) { reject(error); }
    });
  });
}

test("el gateway de desarrollo mantiene dos sockets del chat y transmite avisos", async () => {
  const upstreamSockets = new WebSocketServer({ noServer: true });
  const api = createServer((_req, res) => { res.end("api"); });
  api.on("upgrade", (request, socket, head) => {
    assert.equal(request.url, "/api/chat/socket");
    assert.equal(request.headers.origin, "https://prueba.trycloudflare.com");
    upstreamSockets.handleUpgrade(request, socket, head, (client) => {
      client.send(JSON.stringify({ type: "ready" }));
      client.on("message", () => {
        for (const peer of upstreamSockets.clients) peer.send(JSON.stringify({ type: "refresh" }));
      });
    });
  });
  const web = createServer((_req, res) => { res.end("web"); });
  const logLines = [];
  const clients = [];
  let gateway;
  try {
    const apiPort = await listen(api);
    const webPort = await listen(web);
    gateway = createDevGateway(apiPort, webPort, (line) => logLines.push(line));
    const gatewayPort = await listen(gateway);
    const origin = "https://prueba.trycloudflare.com";
    for (let index = 0; index < 2; index += 1) {
      const client = new WebSocket(`ws://127.0.0.1:${gatewayPort}/api/chat/socket`, { origin });
      clients.push(client);
      const ready = notice(client, "ready");
      await once(client, "open");
      await ready;
    }
    const received = clients.map((client) => notice(client, "refresh"));
    clients[0].send(JSON.stringify({ type: "changed" }));
    await Promise.all(received);
    const reply = clients.map((client) => notice(client, "refresh"));
    clients[1].send(JSON.stringify({ type: "changed" }));
    await Promise.all(reply);
    assert.equal((await (await fetch(`http://127.0.0.1:${gatewayPort}/api/example`)).text()), "api");
    assert.equal((await (await fetch(`http://127.0.0.1:${gatewayPort}/`)).text()), "web");
    assert.equal(logLines.filter((line) => line.includes("WebSocket /api/chat/socket") && line.endsWith("101")).length, 2);
  } finally {
    for (const client of clients) client.terminate();
    for (const client of upstreamSockets.clients) client.terminate();
    upstreamSockets.close();
    if (gateway) await close(gateway);
    if (api.listening) await close(api);
    if (web.listening) await close(web);
  }
});
