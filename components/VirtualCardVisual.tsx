"use client";

import { motion } from "framer-motion";
import { Nfc } from "lucide-react";
import { CATEGORY_LABELS, type VirtualCard } from "@/lib/types";
import { CATEGORY_TINT, usd } from "./format";

export default function VirtualCardVisual({ card, index }: { card: VirtualCard; index: number }) {
  const tint = CATEGORY_TINT[card.category];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 40, rotateX: -35, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.05 }}
      style={{ zIndex: index + 1, transformPerspective: 900 }}
      className="sheen relative aspect-[1.586] w-full overflow-hidden rounded-[18px] p-4 text-white shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.9),0_20px_40px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/15 [&:not(:first-child)]:-mt-[44%]"
    >
      {/* Surface */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 100% 0%, ${tint}38, transparent 55%), radial-gradient(90% 80% at 0% 100%, rgba(255,255,255,0.06), transparent 60%), linear-gradient(135deg, #1b1d21 0%, #0d0e10 60%, #16171a 100%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{ backgroundImage: "repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 7px)" }}
      />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[16px] font-semibold leading-tight">{card.vendorName}</div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-white/50">
              {CATEGORY_LABELS[card.category]} · Single-vendor
            </div>
          </div>
          <div className="text-right">
            <div className="text-[18px] font-semibold leading-tight" style={{ color: tint, fontVariantNumeric: "tabular-nums" }}>
              {usd(card.limit)}
            </div>
            <div className="text-[10.5px] uppercase tracking-[0.16em] text-white/45">Limit</div>
          </div>
        </div>
        <div className="mt-auto flex items-end justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2.5">
              <div className="h-[26px] w-[34px] rounded-[5px] bg-gradient-to-br from-[#e9dcae] via-[#c9b26b] to-[#8f7a3c] p-[3px]">
                <div className="h-full w-full rounded-[3px] border border-black/25 bg-[linear-gradient(90deg,transparent_45%,rgba(0,0,0,0.25)_45%,rgba(0,0,0,0.25)_55%,transparent_55%)]" />
              </div>
              <Nfc className="h-5 w-5 text-white/60" />
            </div>
            <div className="font-mono text-[17px] tracking-[0.18em] text-white/90">•••• •••• •••• {card.last4}</div>
          </div>
          <div className="flex flex-col items-end">
            <span className="mb-1 flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {card.status}
            </span>
            <span className="text-[17px] font-bold italic tracking-tight">
              haggle<span style={{ color: tint }}>.</span>
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
