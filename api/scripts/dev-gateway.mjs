import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";

/** Route one temporary public origin to the local API and Next.js processes. */
export function createDevGateway(apiPort, webPort, log = () => {}) {
  const proxy = createServer((incoming, outgoing) => {
    const targetPort = incoming.url?.startsWith("/api/") || incoming.url?.startsWith("/health") ? apiPort : webPort;
    const started = Date.now();
    const upstream = httpRequest({ hostname: "127.0.0.1", port: targetPort,
      method: incoming.method, path: incoming.url, headers: { ...incoming.headers, host: `localhost:${targetPort}` } },
    (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
      response.on("end", () => log(`${incoming.method} ${incoming.url?.split("?")[0]} → ${targetPort} ${response.statusCode} ${Date.now() - started}ms`));
    });
    upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end("Servicio local no disponible."); });
    incoming.pipe(upstream);
  });
  proxy.on("upgrade", (incoming, socket, head) => {
    const targetPort = incoming.url?.startsWith("/api/") ? apiPort : webPort;
    const route = incoming.url?.split("?")[0] ?? "";
    const upstream = connect(targetPort, "127.0.0.1", () => {
      const headers = Object.entries({ ...incoming.headers, host: `localhost:${targetPort}` })
        .map(([name, value]) => `${name}: ${value}`).join("\r\n");
      upstream.write(`${incoming.method} ${incoming.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.once("data", (chunk) => {
      const status = /^HTTP\/1\.1 (\d{3})/.exec(chunk.toString("latin1", 0, 24))?.[1] ?? "sin respuesta HTTP";
      log(`WebSocket ${route} → ${targetPort} ${status}`);
    });
    upstream.on("error", (error) => {
      log(`WebSocket ${route} → ${targetPort}: ${error.message}`);
      socket.destroy();
    });
    socket.on("error", () => upstream.destroy());
    socket.on("close", () => upstream.destroy());
  });
  return proxy;
}
