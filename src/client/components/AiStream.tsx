import { useState, useRef } from "react";

interface Props {
  /** Pre-built prompt to send as the user message */
  prompt: string;
  /** Button label */
  label?: string;
  /** Button + header accent color class */
  accent?: string;
}

/**
 * Inline AI streaming panel. Sends `prompt` as a single user message to
 * /api/ai/chat (which already has the full party context in its system prompt)
 * and streams the response inline.
 */
export default function AiStream({ prompt, label = "✦ Ask AI", accent = "purple" }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "streaming" | "done" | "error">("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  // Accumulate text synchronously in a ref so state is never stale when
  // setState("done") fires, regardless of React's batching behaviour.
  const textRef = useRef("");

  async function run() {
    if (state === "loading" || state === "streaming") {
      abortRef.current?.abort();
      setState("idle");
      setText("");
      textRef.current = "";
      return;
    }

    setState("loading");
    setText("");
    textRef.current = "";
    setError("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      setState("streaming");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.text) {
              textRef.current += parsed.text;
              setText(textRef.current);
            }
            if (parsed.error) { setError(parsed.error); setState("error"); return; }
            if (parsed.done)  {
              // Flush the final accumulated text into state before marking done,
              // so both updates land in the same React render batch.
              setText(textRef.current);
              setState("done");
              return;
            }
          } catch {}
        }
      }
      setText(textRef.current);
      setState("done");
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setError(e.message ?? "Unknown error");
      setState("error");
    }
  }

  const isActive = state === "loading" || state === "streaming";
  const btnColor = `text-${accent} border-${accent}/30 hover:bg-${accent}/10`;
  // Show the output panel whenever a run has been started (not just when text
  // is populated), so the panel is always visible after completion even if
  // text state lags behind due to batching.
  const showOutput = isActive || state === "done" || !!error;

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        className={`text-xs px-3 py-1.5 rounded border transition-colors ${btnColor} ${isActive ? "opacity-70" : ""}`}
      >
        {isActive ? "◉ Stop" : state === "done" ? "↻ Regenerate" : label}
      </button>

      {showOutput && (
        <div className="card border-purple/20 bg-bg-panel text-sm text-text-muted space-y-1 max-h-[28rem] overflow-y-auto">
          {isActive && !text && (
            <p className="text-text-dim text-xs italic animate-pulse">Thinking…</p>
          )}
          {error && <p className="text-red text-xs">{error}</p>}
          {text && renderMarkdown(text)}
          {isActive && text && (
            <span className="inline-block w-1.5 h-3.5 bg-purple ml-0.5 animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
}

/** Very small markdown renderer: bold, headers, bullet lists */
function renderMarkdown(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("### ")) return <p key={i} className="font-bold text-purple text-xs mt-2">{line.slice(4)}</p>;
    if (line.startsWith("## "))  return <p key={i} className="font-bold text-purple text-sm mt-3">{line.slice(3)}</p>;
    if (line.startsWith("# "))   return <p key={i} className="font-bold text-text-base mt-3">{line.slice(2)}</p>;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return (
        <p key={i} className="flex gap-2 text-xs leading-relaxed">
          <span className="text-purple shrink-0 mt-0.5">·</span>
          <span>{renderInline(line.slice(2))}</span>
        </p>
      );
    }
    if (line === "") return <div key={i} className="h-1" />;
    return <p key={i} className="text-xs leading-relaxed">{renderInline(line)}</p>;
  });
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1
      ? <strong key={i} className="text-text-base font-semibold">{p}</strong>
      : p
  );
}
