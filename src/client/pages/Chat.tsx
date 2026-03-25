import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const SLASH_COMMANDS = [
  { cmd: "/buffs",      desc: "List available buffs and prep recommendations" },
  { cmd: "/combat",     desc: "Combat tips for your party composition" },
  { cmd: "/next-level", desc: "Level-up recommendations for each character" },
  { cmd: "/party",      desc: "Full party composition analysis" },
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "I'm your WotR companion. I have your current save loaded. Ask me anything about your party, or try a slash command:\n\n" +
        SLASH_COMMANDS.map((c) => `**${c.cmd}** — ${c.desc}`).join("\n"),
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || streaming) return;
    if (!override) setInput("");

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    const assistantMsg: Message = { role: "assistant", content: "", streaming: true };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last.streaming) {
                  // Strip any tool status prefix when real text arrives
                  const current = last.content.startsWith("_") ? "" : last.content;
                  next[next.length - 1] = { ...last, content: current + parsed.text };
                }
                return next;
              });
            } else if (parsed.tool) {
              // Show tool call status inline
              const label = parsed.tool === "search_rules"
                ? `_Searching AoN: "${(parsed.input as any).query}"..._`
                : `_Fetching: ${(parsed.input as any).url}_`;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last.streaming) {
                  next[next.length - 1] = { ...last, content: label };
                }
                return next;
              });
            } else if (parsed.error) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                const errMsg = parsed.error.includes("api_key") || parsed.error.includes("API key")
                  ? "API key missing or invalid — set ANTHROPIC_API_KEY in your .env file."
                  : `Error: ${parsed.error}`;
                next[next.length - 1] = { ...last, content: errMsg, streaming: false };
                return next;
              });
              break;
            } else if (parsed.done) {
              break;
            }
          } catch {}
        }
      }
    } catch (e: any) {
      const msg = e.message?.includes("ANTHROPIC_API_KEY")
        ? "API key not set — add ANTHROPIC_API_KEY to your .env file."
        : `Error: ${e.message}`;
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: msg };
        return next;
      });
    } finally {
      setMessages((prev) => {
        const next = [...prev];
        if (next[next.length - 1].streaming) {
          next[next.length - 1] = { ...next[next.length - 1], streaming: false };
        }
        return next;
      });
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  function renderContent(text: string) {
    // Tool status: entire message is _italic_ — show as dim status line
    if (text.startsWith("_") && text.endsWith("_") && !text.slice(1, -1).includes("_")) {
      return (
        <p className="text-cyan/70 text-xs italic animate-pulse">
          {text.slice(1, -1)}
        </p>
      );
    }
    // Basic markdown: **bold**
    return text.split("\n").map((line, i) => {
      const parts = line.split(/\*\*(.+?)\*\*/g);
      return (
        <p key={i} className={line === "" ? "h-2" : "leading-relaxed"}>
          {parts.map((part, j) =>
            j % 2 === 1
              ? <strong key={j} className="text-purple font-semibold">{part}</strong>
              : part
          )}
        </p>
      );
    });
  }

  return (
    <div className="flex flex-col h-full max-w-2xl" style={{ height: "calc(100vh - 4rem)" }}>
      <h2 className="text-purple font-bold text-sm tracking-widest uppercase mb-4 shrink-0">AI Advisor</h2>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={[
              "max-w-lg rounded-lg px-4 py-3 text-sm",
              msg.role === "user"
                ? "bg-bg-elevated border border-bg-border2 text-text-base ml-8"
                : "bg-bg-panel border border-bg-border text-text-muted mr-8",
            ].join(" ")}>
              {msg.role === "assistant" && (
                <div className="text-xs text-purple mb-1 font-semibold">Companion</div>
              )}
              <div className="space-y-0.5">
                {renderContent(msg.content)}
                {msg.streaming && (
                  <span className="inline-block w-1.5 h-3.5 bg-purple ml-0.5 animate-pulse" />
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Slash command hints */}
      <div className="flex gap-2 flex-wrap mb-2 shrink-0">
        {SLASH_COMMANDS.map((c) => (
          <button
            key={c.cmd}
            onClick={() => send(c.cmd)}
            className="text-xs px-2 py-0.5 rounded border border-bg-border2 text-text-dim hover:text-purple hover:border-purple/50 transition-colors"
          >
            {c.cmd}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 shrink-0">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask anything, or try /buffs..."
          disabled={streaming}
          className="flex-1 bg-bg-panel border border-bg-border rounded px-3 py-2 text-sm text-text-base placeholder:text-text-dim focus:outline-none focus:border-purple/50 disabled:opacity-50"
        />
        <button
          onClick={() => send()}
          disabled={streaming || !input.trim()}
          className="px-4 py-2 rounded bg-purple/20 border border-purple/30 text-purple text-sm hover:bg-purple/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {streaming ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
