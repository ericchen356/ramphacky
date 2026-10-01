"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bot, Gift, Store, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { CATEGORY_LABELS, type Negotiation, type Selection } from "@/lib/types";
import AnimatedNumber from "./AnimatedNumber";
import { clock, pct, usd } from "./format";
import { StatusBadge } from "./NegotiationCard";

export default function TranscriptDrawer({
  n,
  selection,
  onClose,
}: {
  n?: Negotiation;
  selection?: Selection;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = n?.messages.length ?? 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [count, n?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const price = n ? n.finalPrice ?? n.currentPrice : undefined;

  return (
    <AnimatePresence>
      {n && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px]"
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-label={`Negotiation with ${n.vendorName}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 36 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l border-white/10 bg-[#0b0c0f]/95 shadow-[-40px_0_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl"
          >
            <div className="border-b border-white/[0.07] p-6">
              <div className="flex items-start gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-[30px] ring-1 ring-white/10">
                  {n.vendorEmoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/40">
                    {CATEGORY_LABELS[n.category]}
                  </div>
                  <div className="truncate text-[22px] font-semibold text-white">{n.vendorName}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusBadge status={n.status} />
                    {selection && (
                      <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-ink">
                        Selected
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close transcript"
                  className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white/[0.06] text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <Stat label="Opening quote" value={usd(n.initialQuote)} muted />
                <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]">
                  <div className="text-[11.5px] font-medium uppercase tracking-wider text-white/40">
                    {n.status === "deal" ? "Final" : "On the table"}
                  </div>
                  <div className="mt-1 text-[20px] font-semibold text-white">
                    {price != null ? <AnimatedNumber value={price} format={usd} /> : "—"}
                  </div>
                </div>
                <Stat label="Saved" value={price != null && n.initialQuote ? `${pct(n.initialQuote, price)}%` : "—"} accent />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[12.5px] text-white/50">
                <span className="rounded-md bg-white/[0.04] px-2 py-1">Target {usd(n.targetPrice)}</span>
                <span className="rounded-md bg-white/[0.04] px-2 py-1">Ceiling {usd(n.maxPrice)}</span>
                {n.perks.map((p) => (
                  <span key={p} className="flex items-center gap-1 rounded-md bg-emerald-400/10 px-2 py-1 text-emerald-300">
                    <Gift className="h-3.5 w-3.5" /> {p}
                  </span>
                ))}
              </div>
              {selection && <p className="mt-3 text-[13.5px] leading-snug text-accent/90">🏆 {selection.rationale}</p>}
              {n.reason && <p className="mt-3 text-[13.5px] leading-snug text-rose-300/90">{n.reason}</p>}
            </div>

            <div ref={scrollRef} className="scroll-thin flex-1 space-y-3 overflow-y-auto p-6">
              {n.messages.length === 0 && (
                <div className="py-16 text-center text-[14px] text-white/35">
                  {n.status === "disqualified" ? "Disqualified before contact — no agent deployed." : "No messages yet."}
                </div>
              )}
              <AnimatePresence initial={false}>
                {n.messages.map((m) => {
                  const agent = m.from === "agent";
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-2.5 ${agent ? "flex-row-reverse" : ""}`}
                    >
                      <div
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 ${
                          agent ? "bg-accent/15 text-accent ring-accent/30" : "bg-sky-400/10 text-sky-300 ring-sky-400/25"
                        }`}
                      >
                        {agent ? <Bot className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                      </div>
                      <div className={`max-w-[80%] ${agent ? "items-end" : "items-start"} flex flex-col`}>
                        <div className="mb-1 text-[11.5px] text-white/35">
                          {agent ? "Haggle agent" : n.vendorName} · {clock(m.ts)}
                        </div>
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-[14.5px] leading-snug ${
                            agent
                              ? "rounded-tr-md bg-accent/[0.1] text-white ring-1 ring-accent/20"
                              : "rounded-tl-md bg-white/[0.06] text-white/90 ring-1 ring-white/[0.08]"
                          }`}
                        >
                          {m.text}
                        </div>
                        {m.offer != null && (
                          <span
                            className={`mt-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${
                              agent ? "bg-accent text-ink" : "bg-sky-400/20 text-sky-200"
                            }`}
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {agent ? "Counter" : "Offer"} {usd(m.offer)}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Stat({ label, value, muted, accent }: { label: string; value: string; muted?: boolean; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]">
      <div className="text-[11.5px] font-medium uppercase tracking-wider text-white/40">{label}</div>
      <div
        className={`mt-1 text-[20px] font-semibold ${muted ? "text-white/45 line-through decoration-white/25" : accent ? "text-accent" : "text-white"}`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
    </div>
  );
}
