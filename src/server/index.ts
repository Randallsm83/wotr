import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import savesRouter from "./routes/saves.ts";
import aiRouter from "./routes/ai.ts";
import { startWatcher } from "./services/file-watcher.ts";
import { isIndexed } from "./services/blueprint-db.ts";
import path from "path";
import fs from "fs";

const PORT = parseInt(process.env.PORT ?? "3000");
const DIST = path.join(import.meta.dir, "../../dist/client");

const app = new Hono();

app.use("*", cors({ origin: "*" }));
app.use("*", logger());

// API routes
app.route("/api", savesRouter);
app.route("/api/ai", aiRouter);

// MIME type map for static assets
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
};

function serveFile(filePath: string): Response {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  return new Response(Bun.file(filePath), {
    headers: { "Content-Type": mime },
  });
}

// Serve built client (production) or proxy hint (dev)
app.get("*", (c) => {
  const url = new URL(c.req.url);
  const filePath = path.join(DIST, url.pathname === "/" ? "index.html" : url.pathname);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveFile(filePath);
  }

  // SPA fallback
  const indexPath = path.join(DIST, "index.html");
  if (fs.existsSync(indexPath)) {
    return serveFile(indexPath);
  }

  return c.text("Run `bun run build:client` or use Vite dev server on :5173", 404);
});

// Startup
console.log("\n🏰 WotR Companion");
console.log("=================");
console.log(`   API:    http://localhost:${PORT}/api`);
console.log(`   Client: http://localhost:5173 (vite dev) or http://localhost:${PORT}`);

if (!isIndexed()) {
  console.warn("\n⚠️  Blueprint index not built.");
  console.warn("   Run: bun run index");
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("\n⚠️  ANTHROPIC_API_KEY not set — AI Advisor will not work.");
  console.warn("   Add it to .env (copy .env.example → .env and fill in your key).");
}

console.log("");

startWatcher();

export default {
  port: PORT,
  fetch: app.fetch,
  idleTimeout: 255, // max allowed — needed for SSE (AI chat, live save events)
};
