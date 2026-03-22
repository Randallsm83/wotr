import fs from "fs";
import { getSavesDir } from "./save-parser.ts";

type WatchCallback = () => void;

const subscribers = new Set<WatchCallback>();
let watcher: ReturnType<typeof fs.watch> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function startWatcher() {
  const dir = getSavesDir();
  if (!fs.existsSync(dir)) {
    console.warn(`[watcher] Saves dir not found: ${dir}`);
    return;
  }

  if (watcher) return; // already watching

  watcher = fs.watch(dir, (event, filename) => {
    if (!filename?.endsWith(".zks")) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`[watcher] Save changed: ${filename}`);
      subscribers.forEach((cb) => cb());
    }, 800);
  });

  console.log(`[watcher] Watching: ${dir}`);
}

export function onSaveChange(cb: WatchCallback): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** SSE helper — returns a Response that pushes events when saves change */
export function createSseResponse(): Response {
  let unsub: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      // Initial ping
      controller.enqueue(enc.encode("event: connected\ndata: {}\n\n"));

      unsub = onSaveChange(() => {
        try {
          controller.enqueue(enc.encode("event: save-updated\ndata: {}\n\n"));
        } catch {
          // client disconnected
        }
      });
    },
    cancel() {
      unsub?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
