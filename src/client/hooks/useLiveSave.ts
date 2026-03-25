import { useState, useEffect, useCallback } from "react";
import type { PartyData } from "../../../src/server/models/types.ts";

export function useLiveSave() {
  const [party, setParty] = useState<PartyData | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [partyRes, analysisRes] = await Promise.all([
        fetch("/api/party"),
        fetch("/api/analysis"),
      ]);
      if (partyRes.ok) {
        const data = await partyRes.json();
        setParty(data);
        setLastUpdate(new Date());
      }
      if (analysisRes.ok) {
        const data = await analysisRes.json();
        setAnalysis(data.analysis);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // SSE live updates
  useEffect(() => {
    const es = new EventSource("/events");
    es.addEventListener("save-updated", () => {
      console.log("[live] Save updated, refreshing...");
      refresh();
    });
    es.onerror = () => {
      // Reconnect silently
    };
    return () => es.close();
  }, [refresh]);

  return { party, analysis, loading, error, refresh, lastUpdate };
}
