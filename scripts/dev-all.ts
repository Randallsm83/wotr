#!/usr/bin/env bun
/**
 * Starts both the Bun API server and Vite dev client in one terminal.
 * Run: bun run dev:all
 */

const RESET  = "\x1b[0m";
const DIM    = "\x1b[2m";
const PURPLE = "\x1b[35m";
const CYAN   = "\x1b[36m";
const RED    = "\x1b[31m";

function prefix(label: string, color: string) {
  return `${color}[${label}]${RESET} `;
}

function relay(proc: ReturnType<typeof Bun.spawn>, label: string, color: string) {
  const pfx = prefix(label, color);
  const decoder = new TextDecoder();

  async function pipe(stream: ReadableStream<Uint8Array> | null | undefined | number, isErr = false) {
    if (!stream || typeof stream === "number") return;
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.trim()) {
          const out = isErr ? `${RED}[${label}]${RESET} ${line}` : `${pfx}${line}`;
          process.stdout.write(out + "\n");
        }
      }
    }
  }

  pipe(proc.stdout, false);
  pipe(proc.stderr, true);
}

// ─── Startup ──────────────────────────────────────────────────────────────────

console.log(`${PURPLE}WotR Companion — Dev Mode${RESET}`);
console.log(`${DIM}Starting API server and Vite client...${RESET}\n`);

const server = Bun.spawn(["bun", "run", "--watch", "src/server/index.ts"], {
  cwd: import.meta.dir + "/..",
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env },
});

// Give server a moment to start before Vite begins
await Bun.sleep(800);

const client = Bun.spawn(["bunx", "vite", "--config", "vite.config.ts"], {
  cwd: import.meta.dir + "/..",
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env },
});

relay(server, "api   ", PURPLE);
relay(client, "vite  ", CYAN);

console.log(`\n${DIM}  API  → http://localhost:3000${RESET}`);
console.log(`${DIM}  App  → http://localhost:5173${RESET}\n`);

// Keep alive; exit when both processes exit
process.on("SIGINT", () => {
  server.kill();
  client.kill();
  process.exit(0);
});

await Promise.all([server.exited, client.exited]);
