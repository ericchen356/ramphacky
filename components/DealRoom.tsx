"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Calendar, Check, CreditCard, MapPin, Terminal, TrendingDown, Users, Wallet } from "lucide-react";
import { useEffect, useRef } from "react";
import { CATEGORY_LABELS, type DietaryKey, type Run } from "@/lib/types";
import AnimatedNumber from "./AnimatedNumber";
import { CATEGORIES, CATEGORY_TINT, bestPerCategory, elapsed, formatDate, liveTotals, usd } from "./format";
import VirtualCardVisual from "./VirtualCardVisual";

const DIETARY_LABEL: Record<DietaryKey, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  glutenFree: "Gluten-free",
  nutAllergy: "Nut-free",
  halal: "Halal",
  kosher: "Kosher",
};

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass shrink-0 rounded-2xl p-5 ${className}`}>{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/45">{children}</div>;
}

export default function DealRoom({ run }: { run: Run }) {
  const spec = run.spec;
  const totals = liveTotals(run);
  const best = bestPerCategory(run);
  const budget = spec?.budget ?? 0;
  const spend = totals.final;
  const scale = Math.max(budget, spend, 1);
  const savingsPct = totals.initial ? (totals.savings / totals.initial) * 100 : 0;
  const over = budget > 0 && spend > budget;
  const cateringPicked = run.selections.some((s) => s.category === "catering");
  const dietary = spec
    ? (Object.entries(spec.dietary) as [DietaryKey, number][]).filter(([, v]) => v > 0)
    : [];
  const logs = [...run.log].reverse().slice(0, 30);
  const cardsRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const cardCount = run.cards.length;
  useEffect(() => {
    // Bring freshly issued cards into view inside the Deal Room column only (never scroll the page).
    const aside = asideRef.current;
    const cards = cardsRef.current;
    if (!cardCount || !aside || !cards) return;
    const h = setTimeout(() => {
      const delta = cards.getBoundingClientRect().top - aside.getBoundingClientRect().top - 48;
      aside.scrollBy({ top: delta, behavior: "smooth" });
    }, 350);
    return () => clearTimeout(h);
  }, [cardCount]);

  return (
    <aside ref={asideRef} className="scroll-thin flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-6 pr-1">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-semibold tracking-tight text-white">Deal Room</h2>
        {run.selections.length > 0 && (
          <span className="text-[13px] text-white/45">{run.selections.length} vendors shortlisted</span>
        )}
      </div>

      {/* Event spec */}
      <Panel>
        <Label>Event</Label>
        {spec ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mt-1.5 text-[22px] font-semibold leading-tight text-white">{spec.title}</div>
            <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[14.5px] text-white/80">
              <Spec icon={Users} text={`${spec.headcount} guests`} />
              <Spec icon={MapPin} text={spec.city} />
              <Spec icon={Calendar} text={formatDate(spec.date)} />
              <Spec icon={Wallet} text={`${usd(spec.budget)} budget`} />
            </div>
          </motion.div>
        ) : (
          <div className="mt-3 space-y-2.5">
            <div className="shimmer h-6 w-2/3 rounded-md" />
            <div className="shimmer h-4 w-full rounded-md" />
            <div className="shimmer h-4 w-4/5 rounded-md" />
          </div>
        )}
      </Panel>

      {/* Savings + budget */}
      <Panel className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/15 blur-3xl" />
        <div className="flex items-center justify-between">
          <Label>{totals.partial ? "Savings so far" : "Negotiated savings"}</Label>
          <span className="flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[13px] font-bold text-accent">
            <TrendingDown className="h-3.5 w-3.5" />
            <AnimatedNumber value={savingsPct} format={(v) => `${v.toFixed(1)}%`} />
          </span>
        </div>
        <div className="mt-1 text-[52px] font-semibold leading-[1.05] tracking-tight">
          <AnimatedNumber value={totals.savings} format={usd} className="text-gradient-accent" duration={1.2} />
        </div>
        <div className="mt-1 flex items-center gap-2 text-[14px] text-white/50" style={{ fontVariantNumeric: "tabular-nums" }}>
          <span className="line-through decoration-white/30">{usd(totals.initial)}</span>
          <span>→</span>
          <span className="font-semibold text-white">
            <AnimatedNumber value={totals.final} format={usd} />
          </span>
          <span className="text-white/35">{totals.partial ? "best live offers" : "final"}</span>
        </div>

        {/* Budget bar */}
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between text-[13px]">
            <span className="text-white/50">Spend vs budget</span>
            <span className={over ? "font-semibold text-rose-300" : "font-semibold text-emerald-300"}>
              {budget ? (over ? `${usd(spend - budget)} over` : `${usd(budget - spend)} under`) : "—"}
            </span>
          </div>
          <div className="relative h-3.5 overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-white/[0.06]">
            <div className="flex h-full">
              {CATEGORIES.map((c) => {
                const n = best[c];
                const v = n ? n.finalPrice ?? n.currentPrice ?? 0 : 0;
                return (
                  <motion.div
                    key={c}
                    className="h-full first:rounded-l-full"
                    style={{ background: CATEGORY_TINT[c] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(v / scale) * 100}%` }}
                    transition={{ type: "spring", stiffness: 90, damping: 20 }}
                  />
                );
              })}
            </div>
            {budget > 0 && (
              <div className="absolute inset-y-0 w-[2px] bg-white" style={{ left: `calc(${(budget / scale) * 100}% - 2px)` }} />
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-white/55">
            {CATEGORIES.map((c) => {
              const n = best[c];
              const v = n ? n.finalPrice ?? n.currentPrice : undefined;
              return (
                <span key={c} className="flex items-center gap-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_TINT[c] }} />
                  {CATEGORY_LABELS[c].split(" ")[0]} <span className="text-white/85">{v != null ? usd(v) : "—"}</span>
                </span>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* Virtual cards */}
      <AnimatePresence>
        {run.cards.length > 0 && (
          <motion.div
            ref={cardsRef}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="shrink-0 scroll-mb-4"
          >
            <div className="mb-2.5 flex items-center justify-between">
              <Label>Virtual cards issued</Label>
              <span className="flex items-center gap-1.5 text-[13px] text-emerald-300">
                <CreditCard className="h-4 w-4" /> {run.cards.length} active
              </span>
            </div>
            <div className="flex flex-col">
              {run.cards.map((c, i) => (
                <VirtualCardVisual key={c.id} card={c} index={i} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dietary */}
      {dietary.length > 0 && (
        <Panel>
          <div className="flex items-center justify-between">
            <Label>Dietary coverage</Label>
            <span className="text-[12.5px] text-white/40">{cateringPicked ? "Covered by selected caterer" : "Pending caterer"}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {dietary.map(([k, v]) => (
              <span
                key={k}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-medium ring-1 transition-colors duration-500 ${
                  cateringPicked ? "bg-emerald-400/12 text-emerald-200 ring-emerald-400/30" : "bg-white/[0.04] text-white/75 ring-white/10"
                }`}
              >
                <span className="font-semibold text-white">{v}</span> {DIETARY_LABEL[k]}
                <AnimatePresence>
                  {cateringPicked && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <Check className="h-4 w-4 text-emerald-300" strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            ))}
          </div>
        </Panel>
      )}

      {/* Orchestrator log */}
      <Panel className="flex min-h-[220px] flex-1 flex-col">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-accent" />
          <Label>Orchestrator</Label>
          <span className="ml-auto flex items-center gap-1.5 text-[12px] text-white/35">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> claude
          </span>
        </div>
        <div className="fade-bottom mt-3 min-h-0 flex-1 overflow-hidden font-mono text-[12.5px] leading-[1.5]">
          <AnimatePresence initial={false}>
            {logs.map((l, i) => (
              <motion.div
                key={`${l.ts}-${l.text}`}
                layout="position"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: Math.max(0.22, 1 - i * 0.09), x: 0 }}
                transition={{ duration: 0.3 }}
                className="flex gap-2.5 py-[3px]"
              >
                <span className="shrink-0 text-white/30">+{elapsed(l.ts - run.createdAt)}</span>
                <span className={i === 0 ? "text-white" : "text-white/75"}>{l.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {logs.length === 0 && <div className="text-white/30">Waiting for orchestrator…</div>}
        </div>
      </Panel>
    </aside>
  );
}

function Spec({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-accent/80" />
      <span className="truncate">{text}</span>
    </div>
  );
}
