"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Ban, Check, LogOut, Trophy } from "lucide-react";
import type { Negotiation, NegotiationStatus } from "@/lib/types";
import AnimatedNumber from "./AnimatedNumber";
import { pct, usd } from "./format";

export function StatusBadge({ status }: { status: NegotiationStatus }) {
  const map: Record<NegotiationStatus, { label: string; cls: string; dot?: string; pulse?: boolean }> = {
    queued: { label: "Queued", cls: "bg-white/[0.05] text-white/45 ring-white/10", dot: "bg-white/30" },
    contacting: { label: "Contacting", cls: "bg-sky-400/10 text-sky-300 ring-sky-400/25", dot: "bg-sky-400", pulse: true },
    negotiating: { label: "Negotiating", cls: "bg-amber-300/10 text-amber-200 ring-amber-300/25", dot: "bg-amber-300", pulse: true },
    deal: { label: "Deal", cls: "bg-emerald-400/12 text-emerald-300 ring-emerald-400/30" },
    walked_away: { label: "Walked away", cls: "bg-rose-400/10 text-rose-300 ring-rose-400/25" },
    disqualified: { label: "Disqualified", cls: "bg-white/[0.04] text-white/40 ring-white/10" },
  };
  const s = map[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] font-semibold ring-1 ${s.cls}`}>
      {s.dot && (
        <span className="relative flex h-1.5 w-1.5">
          {s.pulse && <span className={`ping-soft absolute inline-flex h-full w-full rounded-full ${s.dot}`} />}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${s.dot}`} />
        </span>
      )}
      {status === "deal" && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      {status === "walked_away" && <LogOut className="h-3 w-3" strokeWidth={2.5} />}
      {status === "disqualified" && <Ban className="h-3 w-3" strokeWidth={2.5} />}
      {s.label}
    </span>
  );
}

/** Offer history strip: vendor asks as a descending line, buyer counters as hollow dots. Stretches to width. */
function OfferTrail({ n }: { n: Negotiation }) {
  const offers = n.messages.filter((m) => m.offer != null);
  const W = 200;
  const H = 26;
  if (offers.length < 1) {
    return <div className="h-[26px] w-full rounded-md border border-dashed border-white/[0.07]" />;
  }
  const vals = offers.map((m) => m.offer!);
  const max = Math.max(...vals, n.initialQuote ?? 0);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const x = (i: number) => (offers.length === 1 ? 6 : 6 + (i / (offers.length - 1)) * (W - 12));
  const y = (v: number) => 4 + (1 - (v - min) / span) * (H - 8);
  const vendorPts = offers.map((m, i) => ({ m, i })).filter(({ m }) => m.from === "vendor");
  const path = vendorPts.map(({ m, i }, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(m.offer!).toFixed(1)}`).join(" ");
  const color = n.status === "deal" ? "#34d399" : n.status === "walked_away" ? "#fb7185" : "#d4ff3a";
  const pctX = (i: number) => `${((x(i) / W) * 100).toFixed(2)}%`;
  const pctY = (v: number) => `${((y(v) / H) * 100).toFixed(2)}%`;
  return (
    <div className="relative h-[26px] w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`g-${n.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.25" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {vendorPts.length > 1 && (
          <path
            d={`${path} L${x(vendorPts[vendorPts.length - 1].i).toFixed(1)},${H} L${x(vendorPts[0].i).toFixed(1)},${H} Z`}
            fill={`url(#g-${n.id})`}
          />
        )}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {offers.map((m, i) => (
        <motion.span
          key={m.id}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: pctX(i),
            top: pctY(m.offer!),
            background: m.from === "vendor" ? color : "transparent",
            border: m.from === "vendor" ? "none" : "1.5px solid rgba(255,255,255,0.6)",
          }}
          title={`${m.from === "vendor" ? "Vendor" : "Agent"} ${usd(m.offer)}`}
        />
      ))}
    </div>
  );
}

export default function NegotiationCard({
  n,
  selected,
  onOpen,
}: {
  n: Negotiation;
  selected: boolean;
  onOpen: () => void;
}) {
  const dq = n.status === "disqualified";
  const walked = n.status === "walked_away";
  const live = n.status === "contacting" || n.status === "negotiating";
  const price = n.finalPrice ?? n.currentPrice;
  const saved = pct(n.initialQuote, price);
  const last = n.messages[n.messages.length - 1];
  const waitingOnVendor = live && (!last || last.from === "agent");

  return (
    <motion.button
      layout
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: dq ? 0.5 : 1, y: 0, scale: 1 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={`@container group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl p-3 text-left transition-[box-shadow,border-color] duration-500 ${
        selected
          ? "glow-accent border border-transparent bg-[linear-gradient(180deg,rgba(212,255,58,0.09),rgba(255,255,255,0.02))]"
          : "glass hover:border-white/15"
      }`}
    >
      {live && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
      )}

      <div className="flex items-center gap-2.5">
        <div className={`grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-white/[0.06] text-[20px] ring-1 ring-white/10 ${dq ? "grayscale" : ""}`}>
          {n.vendorEmoji}
        </div>
        <div className="min-w-0 flex-1">
          <div
            title={n.vendorName}
            className={`truncate text-[14.5px] font-semibold leading-tight text-white ${dq ? "line-through decoration-white/40" : ""}`}
          >
            {n.vendorName}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={n.status} />
            <AnimatePresence>
              {selected && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.7, x: 8 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-accent px-1.5 py-[3px] @min-[230px]:px-2 text-[10.5px] font-bold uppercase tracking-wider text-ink shadow-[0_0_14px_-2px_rgba(212,255,58,0.7)]"
                >
                  <Trophy className="h-3 w-3" strokeWidth={2.75} />
                  <span className="hidden @min-[230px]:inline">Selected</span>
                </motion.span>
              )}
            </AnimatePresence>
            {waitingOnVendor && last && (
              <span className="flex gap-0.5" aria-label="Vendor is typing" title="Vendor is typing">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="typing-dot h-1 w-1 rounded-full bg-white/60" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            )}
          </div>
        </div>
      </div>

      {dq || (walked && price == null) ? (
        <div className="mt-2.5 flex-1 rounded-lg bg-white/[0.03] px-2.5 py-2 text-[12.5px] leading-snug text-white/55">
          {n.reason ?? "Not a fit for this brief"}
        </div>
      ) : (
        <>
          <div className="mt-2.5 flex items-center gap-1.5 @min-[200px]:gap-2">
            {price != null ? (
              <AnimatedNumber
                value={price}
                format={usd}
                className={`shrink-0 text-[20px] font-semibold leading-none tracking-tight @min-[200px]:text-[23px] ${walked ? "text-white/45 line-through" : "text-white"}`}
              />
            ) : (
              <span className="shrink-0 text-[20px] @min-[200px]:text-[23px] font-semibold leading-none tracking-tight text-white/20">$—</span>
            )}
            <AnimatePresence>
              {saved > 0 && !walked && (
                <motion.span
                  key="saved"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[12.5px] font-bold ${n.status === "deal" ? "bg-emerald-400/15 text-emerald-300" : "bg-accent/12 text-accent"}`}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  −{saved}%
                </motion.span>
              )}
            </AnimatePresence>
            <div className="min-w-[36px] flex-1">
              <OfferTrail n={n} />
            </div>
          </div>
          <div className="mt-1 h-[15px] text-[12px] leading-none text-white/35" style={{ fontVariantNumeric: "tabular-nums" }}>
            {n.initialQuote != null && price !== n.initialQuote ? (
              <>
                <span className="line-through decoration-white/30">{usd(n.initialQuote)}</span> opening ask
              </>
            ) : n.initialQuote != null ? (
              "opening ask"
            ) : (
              ""
            )}
          </div>

          <div className="mt-1.5 min-h-[17px] text-[12.5px] leading-[1.35]">
            <AnimatePresence mode="wait" initial={false}>
              {last ? (
                <motion.div
                  key={last.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="line-clamp-1 text-white/65"
                >
                  <span className={`mr-1 font-semibold ${last.from === "agent" ? "text-accent" : "text-sky-300"}`}>
                    {last.from === "agent" ? "Agent:" : "Vendor:"}
                  </span>
                  {last.text}
                </motion.div>
              ) : (
                <motion.div key="idle" className="text-white/30">
                  {n.status === "queued" ? "Waiting for an agent…" : "Opening the conversation…"}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </motion.button>
  );
}
