import { useState, useEffect } from "react";
import Dashboard from "./pages/Dashboard.tsx";
import SpellPlanner from "./pages/SpellPlanner.tsx";
import PartyAnalysis from "./pages/PartyAnalysis.tsx";
import BubbleBuffsPage from "./pages/BubbleBuffs.tsx";
import Characters from "./pages/Characters.tsx";
import Chat from "./pages/Chat.tsx";
import { useLiveSave } from "./hooks/useLiveSave.ts";

type Page = "dashboard" | "characters" | "spells" | "analysis" | "bubbles" | "chat";

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard",  label: "Dashboard",      icon: "⚔" },
  { id: "characters", label: "Characters",      icon: "▦" },
  { id: "spells",     label: "Spell Planner",   icon: "✦" },
  { id: "analysis",   label: "Party Analysis",  icon: "⊞" },
  { id: "bubbles",    label: "BubbleBuffs",     icon: "◎" },
  { id: "chat",       label: "AI Advisor",      icon: "◈" },
];

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const { lastUpdate } = useLiveSave();

  return (
    <div className="flex h-full min-h-screen">
      {/* Sidebar */}
      <aside className="w-44 bg-bg-panel border-r border-bg-border flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-bg-border">
          <div className="text-purple font-bold text-sm tracking-widest uppercase">WotR</div>
          <div className="text-text-dim text-xs">Companion</div>
        </div>
        <nav className="flex flex-col gap-1 p-2 flex-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={[
                "flex items-center gap-2 px-3 py-2 rounded text-sm text-left transition-colors",
                page === item.id
                  ? "bg-bg-elevated text-purple border border-bg-border2"
                  : "text-text-muted hover:text-text-base hover:bg-bg-elevated",
              ].join(" ")}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        {lastUpdate && (
          <div className="px-3 py-2 border-t border-bg-border text-xs text-text-dim">
            <span className="text-green">●</span> Live save connected
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-bg-base p-6">
        {page === "dashboard"  && <Dashboard />}
        {page === "characters" && <Characters />}
        {page === "spells"    && <SpellPlanner />}
        {page === "analysis"  && <PartyAnalysis />}
        {page === "bubbles"   && <BubbleBuffsPage />}
        {page === "chat"      && <Chat />}
      </main>
    </div>
  );
}
