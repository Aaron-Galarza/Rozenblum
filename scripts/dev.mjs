import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "apps", "api");
const webDir = join(root, "apps", "web");
const sharedDir = join(root, "packages", "shared");
const mode = process.argv[2];
if (!["api", "web", "all"].includes(mode)) {
  console.error("Uso: node scripts/dev.mjs api|web|all");
  process.exit(1);
}

const children = new Set();
let gateway;
let stopping = false;
const log = (message) => console.log(`[desarrollo] ${message}`);
const packageBin = (directory, name) => createRequire(join(directory, "package.json")).resolve(name);
const localEnv = existsSync(join(apiDir, ".env")) ? readFileSync(join(apiDir, ".env"), "utf8") : "";
function localEnvValue(name) {
  return process.env[name] || new RegExp(`^${name}=(.+)$`, "m").exec(localEnv)?.[1]?.trim() || "";
}
function paymentCredentialsReady() {
  return ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_WEBHOOK_SECRET"].every((name) => Boolean(localEnvValue(name)));
}

async function cloudflaredExecutable() {
  if (process.env.CLOUDFLARED_PATH) return process.env.CLOUDFLARED_PATH;
  if (spawnSync("cloudflared", ["--version"], { stdio: "ignore", windowsHide: true }).status === 0) return "cloudflared";
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Instalá cloudflared o configurá CLOUDFLARED_PATH.");
  }
  const cache = join(tmpdir(), "rozenblum-dev-tools");
  const binary = join(cache, "cloudflared.exe");
  if (existsSync(binary) && statSync(binary).size > 1_000_000) return binary;
  mkdirSync(cache, { recursive: true });
  log("Descargando cloudflared oficial para pruebas locales (solo la primera vez)...");
  const url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error("No se pudo descargar cloudflared. Instalalo manualmente.");
  const temporary = `${binary}.${process.pid}.tmp`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  if (statSync(temporary).size < 1_000_000) throw new Error("La descarga de cloudflared está incompleta.");
  renameSync(temporary, binary);
  return binary;
}

function start(label, executable, args, options = {}) {
  const child = spawn(executable, args, { cwd: options.cwd ?? root, env: options.env ?? process.env,
    stdio: options.stdio ?? "inherit", windowsHide: true });
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!stopping && !options.allowExit) {
      console.error(`[desarrollo] ${label} terminó (${signal ?? code ?? "desconocido"}).`);
      void stop(1);
    }
  });
  child.on("error", (error) => {
    console.error(`[desarrollo] No se pudo iniciar ${label}: ${error.message}`);
    if (!stopping) void stop(1);
  });
  return child;
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  gateway?.close();
  await Promise.all([...children].map((child) => new Promise((done) => {
    if (!child.pid) return done();
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true });
      killer.on("exit", done);
      killer.on("error", done);
    } else {
      child.kill("SIGTERM");
      child.once("exit", done);
      setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 3_000).unref();
    }
  })));
  process.exit(code);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

async function buildShared() {
  const compiler = packageBin(sharedDir, "typescript/bin/tsc");
  await new Promise((done, reject) => {
    const child = start("tipos compartidos", process.execPath, [compiler, "-p", "tsconfig.build.json"],
      { cwd: sharedDir, allowExit: true });
    child.once("exit", (code) => code === 0 ? done() : reject(new Error("Falló la compilación compartida.")));
  });
}

function localGateway(port) {
  const proxy = createServer((incoming, outgoing) => {
    const targetPort = incoming.url?.startsWith("/api/") || incoming.url?.startsWith("/health") ? port : 3000;
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
    const targetPort = incoming.url?.startsWith("/api/") ? port : 3000;
    const upstream = connect(targetPort, "127.0.0.1", () => {
      const headers = Object.entries({ ...incoming.headers, host: `localhost:${targetPort}` })
        .map(([name, value]) => `${name}: ${value}`).join("\r\n");
      upstream.write(`${incoming.method} ${incoming.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
  });
  return proxy;
}

async function tunnel(port) {
  if (process.env.ROZENBLUM_SKIP_TUNNEL === "1") return `http://127.0.0.1:${port}`;
  const executable = await cloudflaredExecutable();
  return new Promise((done, reject) => {
    const child = start("túnel HTTPS", executable,
      ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
    const timeout = setTimeout(() => reject(new Error("El túnel no entregó una URL en 45 segundos.")), 45_000);
    const inspect = (chunk) => {
      const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) { clearTimeout(timeout); done(match[0]); }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", () => { clearTimeout(timeout); reject(new Error("El túnel se cerró antes de iniciar.")); });
  });
}

try {
  await buildShared();
  if (mode === "web") {
    const next = packageBin(webDir, "next/dist/bin/next");
    start("web", process.execPath, [next, "dev", "-p", "3000"], { cwd: webDir });
    log("Web local: http://localhost:3000");
  }
  if (mode === "api" || mode === "all") {
    const port = Number(localEnvValue("PORT") || 4000);
    gateway = localGateway(port);
    await new Promise((done, reject) => gateway.listen(4001, "127.0.0.1", done).once("error", reject));
    const publicUrl = await tunnel(4001);
    log(`URL pública temporal: ${publicUrl}`);
    log("Webhook: " + publicUrl + "/api/payments/mercadopago/webhook");
    log("El retorno del comprador usa la misma URL pública.");
    if (mode === "all") {
      const next = packageBin(webDir, "next/dist/bin/next");
      start("web", process.execPath, [next, "dev", "-p", "3000"], {
        cwd: webDir, env: { ...process.env, NEXT_PUBLIC_API_URL: publicUrl },
      });
      log("Web local: http://localhost:3000");
    }
    const tsx = packageBin(apiDir, "tsx/cli");
    const paymentsReady = paymentCredentialsReady();
    if (!paymentsReady) log("Mercado Pago desactivado: activá token y firma en apps/api/.env para probar pagos reales.");
    start("API", process.execPath, [tsx, "watch", "src/server.ts"], {
      cwd: apiDir,
      env: { ...process.env,
        ...(paymentsReady ? { WEB_PUBLIC_URL: publicUrl,
          MERCADOPAGO_NOTIFICATION_URL: `${publicUrl}/api/payments/mercadopago/webhook` } : {}),
        CORS_ORIGIN: [localEnvValue("CORS_ORIGIN") || "http://localhost:3000", publicUrl].join(",") },
    });
    log(`API local: http://localhost:${port}`);
  }
} catch (error) {
  console.error(`[desarrollo] ${error.message}`);
  await stop(1);
}
