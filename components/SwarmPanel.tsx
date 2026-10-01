"use client";

import { LayoutGroup, motion } from "framer-motion";
import { Bot, Clapperboard, Handshake, MessagesSquare, Timer, Utensils, Warehouse } from "lucide-react";
import { useEffect, useState } from "react";
import { CATEGORY_LABELS, type Category, type Run, type RunStatus } from "@/lib/types";
import AnimatedNumber from "./AnimatedNumber";
import { CATEGORIES, CATEGORY_TINT, elapsed, isActive } from "./format";
import NegotiationCard from "./NegotiationCard";

const CAT_ICON: Record<Category, typeof Bot> = { venue: Warehouse, catering: Utensils, av: Clapperboard };

export function RunStatusPill({ status }: { status: RunStatus }) {
  const map: Record<RunStatus, { label: string; cls: string; live?: boolean }> = {
    parsing: { label: "Parsing brief", cls: "text-sky-200 bg-sky-400/10 ring-sky-400/30", live: true },
    sourcing: { label: "Sourcing vendors", cls: "text-sky-200 bg-sky-400/10 ring-sky-400/30", live: true },
    negotiating: { label: "Negotiating live", cls: "text-amber-100 bg-amber-300/10 ring-amber-300/30", live: true },
    awaiting_approval: { label: "Awaiting approval", cls: "text-ink bg-accent ring-accent" },
    approved: { label: "Booked", cls: "text-emerald-200 bg-emerald-400/15 ring-emerald-400/40" },
    failed: { label: "Failed", cls: "text-rose-200 bg-rose-400/15 ring-rose-400/40" },
  };
  const s = map[status];
  return (
    <motion.span
      key={status}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ${s.cls}`}
    >
      {s.live && (
        <span className="relative flex h-2 w-2">
          <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-current" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
        </span>
      )}
      {s.label}
    </motion.span>
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(h);
  }, [active]);
  return now;
}

function Counter({ icon: Icon, label, children }: { icon: typeof Bot; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.035] px-3 py-1.5 ring-1 ring-white/[0.06]">
      <Icon className="hidden h-4 w-4 text-white/40 2xl:block" />
      <div>
        <div className="text-[18px] font-semibold leading-none text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
          {children}
        </div>
        <div className="mt-1 text-[10.5px] font-medium uppercase tracking-wider text-white/40">{label}</div>
      </div>
    </div>
  );
}

export default function SwarmPanel({ run, onOpen }: { run: Run; onOpen: (id: string) => void }) {
  const active = isActive(run.status);
  const now = useNow(active);
  const negs = run.negotiations;
  const activeAgents = negs.filter((n) => n.status === "contacting" || n.status === "negotiating").length;
  const msgCount = negs.reduce((s, n) => s + n.messages.length, 0);
  const deals = negs.filter((n) => n.status === "deal").length;
  const lastTs = Math.max(run.createdAt, ...negs.flatMap((n) => n.messages.map((m) => m.ts)), ...run.log.map((l) => l.ts));
  const elapsedMs = (active ? now : lastTs) - run.createdAt;
  const selectedIds = new Set(run.selections.map((s) => s.negotiationId));

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-3">
          <h2 className="text-[22px] font-semibold tracking-tight text-white">Agent Swarm</h2>
          <RunStatusPill status={run.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Counter icon={Bot} label="Agents live">
            <AnimatedNumber value={activeAgents} format={(v) => String(Math.round(v))} duration={0.4} />
            <span className="text-[14px] text-white/35">/{negs.length || 12}</span>
          </Counter>
          <Counter icon={MessagesSquare} label="Messages">
            <AnimatedNumber value={msgCount} format={(v) => String(Math.round(v))} duration={0.5} />
          </Counter>
          <Counter icon={Handshake} label="Deals">
            <AnimatedNumber value={deals} format={(v) => String(Math.round(v))} duration={0.4} />
          </Counter>
          <Counter icon={Timer} label="Elapsed">
            {elapsed(elapsedMs)}
          </Counter>
        </div>
      </header>

      <div className="scroll-thin @container -mr-2 min-h-0 flex-1 overflow-y-auto pb-4 pr-2">
        <LayoutGroup>
          <div className="grid grid-cols-1 gap-4 @min-[540px]:grid-cols-3 @min-[540px]:gap-2.5">
            {CATEGORIES.map((c) => {
              const items = negs.filter((n) => n.category === c);
              const Icon = CAT_ICON[c];
              return (
                <div key={c} className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md ring-1 ring-white/10"
                      style={{ background: `${CATEGORY_TINT[c]}14`, color: CATEGORY_TINT[c] }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="truncate text-[13px] font-semibold uppercase tracking-[0.12em] text-white/75">{CATEGORY_LABELS[c]}</h3>
                    <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                    <span className="shrink-0 text-[12px] text-white/40" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {items.filter((n) => n.status === "deal").length}/{items.length || 4}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 @min-[420px]:grid-cols-2 @min-[540px]:grid-cols-1">
                    {items.length
                      ? items.map((n) => (
                          <NegotiationCard key={n.id} n={n} selected={selectedIds.has(n.id)} onOpen={() => onOpen(n.id)} />
                        ))
                      : [0, 1, 2, 3].map((i) => <div key={i} className="shimmer h-[146px] rounded-2xl ring-1 ring-white/[0.05]" />)}
                  </div>
                </div>
              );
            })}
          </div>
        </LayoutGroup>
      </div>
    </section>
  );
}
