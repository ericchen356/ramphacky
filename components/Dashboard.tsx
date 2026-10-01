"use client";

import { AnimatePresence, MotionGlobalConfig, motion } from "framer-motion";
import { ChevronDown, FlaskConical, Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Run } from "@/lib/types";
import { SAMPLE_BRIEF, createMockSimulator, mockFixture, type MockSimulator } from "@/lib/mock-run";
import DealRoom from "./DealRoom";
import EmptyHero from "./EmptyHero";
import SlackPanel from "./SlackPanel";
import SwarmPanel, { RunStatusPill } from "./SwarmPanel";
import TranscriptDrawer from "./TranscriptDrawer";

type Conn = "connecting" | "live" | "offline" | "mock";

export default function Dashboard() {
  const [runs, setRuns] = useState<Map<string, Run>>(() => new Map());
  const [mode, setMode] = useState<"pending" | "live" | "mock">("pending");
  const [conn, setConn] = useState<Conn>("connecting");
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [openNegId, setOpenNegId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const simRef = useRef<MockSimulator | null>(null);
  const autoRef = useRef(false);
  const fixtureLoaded = useRef(false);

  const upsert = useCallback((r: Run) => {
    setRuns((prev) => {
      const next = new Map(prev);
      next.set(r.id, r);
      return next;
    });
  }, []);

  // Decide mode from the URL (client-only to avoid hydration mismatch).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const mock = p.get("mock") === "1";
    autoRef.current = p.get("auto") === "1";
    // `?instant=1` skips JS animations (useful for screenshots from background tabs).
    if (p.get("instant") === "1") MotionGlobalConfig.skipAnimations = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(mock ? "mock" : "live");
    if (mock) {
      const fixture = p.get("fixture");
      if (fixture && !fixtureLoaded.current) {
        fixtureLoaded.current = true;
        upsert(mockFixture({ approved: fixture === "approved" }));
      }
    }
  }, [upsert]);

  // Mock simulator
  useEffect(() => {
    if (mode !== "mock") return;
    const sim = createMockSimulator(upsert);
    simRef.current = sim;
    let h: ReturnType<typeof setTimeout> | undefined;
    if (autoRef.current) h = setTimeout(() => sim.start(SAMPLE_BRIEF), 900);
    return () => {
      if (h) clearTimeout(h);
      sim.stop();
      simRef.current = null;
    };
  }, [mode, upsert]);

  // Live SSE stream with manual reconnect when the endpoint is missing / server restarts.
  useEffect(() => {
    if (mode !== "live") return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const connect = () => {
      setConn("connecting");
      es = new EventSource("/api/stream");
      es.onopen = () => setConn("live");
      es.onmessage = (ev) => {
        try {
          const run = JSON.parse(ev.data) as Run;
          if (run && typeof run.id === "string") upsert(run);
        } catch {
          /* ignore malformed frames */
        }
      };
      es.onerror = () => {
        if (!es || es.readyState === EventSource.CLOSED) {
          setConn("offline");
          es?.close();
          if (!closed) retry = setTimeout(connect, 3000);
        } else {
          setConn("connecting");
        }
      };
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, [mode, upsert]);

  const sorted = useMemo(() => [...runs.values()].sort((a, b) => b.createdAt - a.createdAt), [runs]);
  const run = (pinnedId && runs.get(pinnedId)) || sorted[0];

  // Auto-approve in `?mock=1&auto=1` demo loops.
  useEffect(() => {
    if (mode !== "mock" || !autoRef.current || run?.status !== "awaiting_approval") return;
    const h = setTimeout(() => simRef.current?.approve(run), 4000);
    return () => clearTimeout(h);
  }, [mode, run]);

  const start = useCallback(
    async (brief: string) => {
      setError(null);
      setPinnedId(null);
      setOpenNegId(null);
      if (mode === "mock") {
        simRef.current?.start(brief);
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brief }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { run?: Run };
        if (data.run) upsert(data.run);
      } catch (e) {
        setError(`Couldn't reach the swarm (${e instanceof Error ? e.message : "network error"}). Try ?mock=1 for demo mode.`);
      } finally {
        setBusy(false);
      }
    },
    [mode, upsert],
  );

  const approve = useCallback(async () => {
    if (!run) return;
    setError(null);
    if (mode === "mock") {
      simRef.current?.approve(run);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(run.id)}/approve`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { run?: Run };
      if (data.run) upsert(data.run);
    } catch (e) {
      setError(`Approval failed (${e instanceof Error ? e.message : "network error"}).`);
    } finally {
      setBusy(false);
    }
  }, [run, mode, upsert]);

  const openNeg = run?.negotiations.find((n) => n.id === openNegId);
  const viewDetails = () => {
    const first = run?.selections[0]?.negotiationId;
    if (first) setOpenNegId(first);
  };

  return (
    <div className="relative flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <div className="bg-ambient" aria-hidden />

      {/* Top bar */}
      <header className="relative z-20 flex h-[60px] shrink-0 items-center gap-4 px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-[17px] shadow-[0_0_24px_-4px_rgba(212,255,58,0.7)]">🤝</div>
          <span className="text-[20px] font-bold tracking-tight text-white">
            haggle<span className="text-accent">.</span>
          </span>
        </div>
        <span className="hidden text-[14px] text-white/40 md:inline">Agent swarm procurement for corporate events</span>

        <div className="ml-auto flex items-center gap-3">
          {sorted.length > 1 && run && (
            <div className="relative">
              <button
                onClick={() => setSwitcherOpen((v) => !v)}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] text-white/75 transition hover:bg-white/[0.08]"
              >
                {run.spec?.title ?? "New run"} <span className="text-white/35">· {sorted.length} runs</span>
                <ChevronDown className="h-4 w-4" />
              </button>
              <AnimatePresence>
                {switcherOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="glass absolute right-0 top-11 z-50 w-[300px] overflow-hidden rounded-xl bg-[#0e0f12]/95 p-1"
                  >
                    {sorted.map((r, i) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setPinnedId(i === 0 ? null : r.id);
                          setSwitcherOpen(false);
                        }}
                        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-white/[0.06] ${
                          r.id === run.id ? "bg-white/[0.05]" : ""
                        }`}
                      >
                        <span className="min-w-0 truncate text-white/85">
                          {r.spec?.title ?? r.brief.slice(0, 40)}
                          <span className="ml-1.5 text-white/35">{new Date(r.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                        </span>
                        <span className="shrink-0 scale-90">
                          <RunStatusPill status={r.status} />
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          <ConnBadge conn={mode === "mock" ? "mock" : conn} />
        </div>
      </header>

      <main
        className={`relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-5 px-6 pb-5 lg:grid-cols-[clamp(290px,24vw,360px)_minmax(0,1fr)_clamp(300px,25vw,370px)] xl:gap-5`}
      >
        <div className="h-[720px] min-h-0 lg:h-auto">
          <SlackPanel
            run={run}
            onSend={start}
            onApprove={approve}
            onViewDetails={viewDetails}
            busy={busy}
            error={error}
          />
        </div>

        {run ? (
          <>
            <div className="min-h-0 min-w-0">
              <SwarmPanel run={run} onOpen={setOpenNegId} />
            </div>
            <div className="min-h-0 min-w-0">
              <DealRoom run={run} />
            </div>
          </>
        ) : (
          <div className="min-h-0 lg:col-span-2">
            <EmptyHero onSample={() => start(SAMPLE_BRIEF)} busy={busy || mode === "pending"} />
          </div>
        )}
      </main>

      <TranscriptDrawer
        n={openNeg}
        selection={run?.selections.find((s) => s.negotiationId === openNegId)}
        onClose={() => setOpenNegId(null)}
      />
    </div>
  );
}

function ConnBadge({ conn }: { conn: Conn }) {
  const map: Record<Conn, { label: string; cls: string; icon: typeof Radio }> = {
    live: { label: "Live", cls: "text-emerald-300 border-emerald-400/25 bg-emerald-400/[0.06]", icon: Radio },
    connecting: { label: "Connecting", cls: "text-white/50 border-white/10 bg-white/[0.03]", icon: Radio },
    offline: { label: "Backend offline", cls: "text-amber-200 border-amber-300/25 bg-amber-300/[0.06]", icon: Radio },
    mock: { label: "Demo mode", cls: "text-violet-200 border-violet-400/25 bg-violet-400/[0.06]", icon: FlaskConical },
  };
  const s = map[conn];
  const Icon = s.icon;
  return (
    <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${s.cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}
