"use client";

import { motion } from "framer-motion";
import { ArrowRight, MessageCircle, Sparkles, Zap } from "lucide-react";

const NODES = ["🏭", "🏙️", "🌆", "🪴", "🥗", "🍱", "🌮", "🍖", "🎛️", "🎤", "📽️", "🔊"];

function SwarmViz() {
  const W = 560;
  const H = 330;
  const cx = W / 2;
  const cy = H / 2;
  const pts = NODES.map((e, i) => {
    const a = (i / NODES.length) * Math.PI * 2 - Math.PI / 2;
    return { e, x: Math.round(cx + Math.cos(a) * 235), y: Math.round(cy + Math.sin(a) * 130), i };
  });
  return (
    <div className="relative mx-auto w-full max-w-[min(560px,calc((100vh-500px)*1.75))] min-w-[280px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" aria-hidden>
        <defs>
          <radialGradient id="core" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#d4ff3a" stopOpacity="0.55" />
            <stop offset="1" stopColor="#d4ff3a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx={cx} cy={cy} rx={235} ry={130} fill="none" stroke="rgba(255,255,255,0.06)" strokeDasharray="2 6" />
        {pts.map((p) => (
          <g key={p.i}>
            <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(212,255,58,0.14)" strokeWidth={1} />
            <motion.circle
              r={2.6}
              fill="#d4ff3a"
              initial={{ cx, cy, opacity: 0 }}
              animate={{ cx: [cx, p.x, cx], cy: [cy, p.y, cy], opacity: [0, 1, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, delay: p.i * 0.23, ease: "easeInOut" }}
            />
          </g>
        ))}
        <circle cx={cx} cy={cy} r={70} fill="url(#core)" />
      </svg>
      {pts.map((p) => (
        <motion.div
          key={p.i}
          className="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-[#121418] text-[20px] ring-1 ring-white/10 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.8)]"
          style={{ left: `${((p.x / W) * 100).toFixed(2)}%`, top: `${((p.y / H) * 100).toFixed(2)}%` }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1, y: [0, -4, 0] }}
          transition={{
            opacity: { delay: 0.2 + p.i * 0.05 },
            scale: { delay: 0.2 + p.i * 0.05, type: "spring" },
            y: { duration: 3 + (p.i % 3), repeat: Infinity, ease: "easeInOut" },
          }}
        >
          {p.e}
        </motion.div>
      ))}
      <div className="absolute left-1/2 top-1/2 grid h-[74px] w-[74px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[22px] bg-accent text-[34px] shadow-[0_0_60px_-6px_rgba(212,255,58,0.8)]">
        🤝
      </div>
    </div>
  );
}

export default function EmptyHero({ onSample, busy }: { onSample: () => void; busy: boolean }) {
  return (
    <div className="scroll-thin flex h-full flex-col items-center overflow-y-auto px-6 py-6 text-center">
      <div className="my-auto flex w-full flex-col items-center">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.07] px-3.5 py-1.5 text-[13px] font-medium text-accent"
      >
        <Sparkles className="h-3.5 w-3.5" /> 12 Claude agents · negotiating in parallel
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="max-w-[820px] text-balance text-[52px] font-semibold leading-[1.02] tracking-[-0.035em] 2xl:text-[68px] [@media(min-height:860px)]:text-[64px]"
      >
        <span className="text-gradient">Your events, negotiated </span>
        <span className="text-gradient-accent">by a swarm.</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="mt-4 max-w-[680px] text-pretty text-[17px] leading-relaxed text-white/55"
      >
        Post a brief in Slack. Haggle deploys a swarm of AI buyers that haggle with every venue, caterer and AV crew at once — then
        books the winners on single-vendor virtual cards the moment you hit <b className="text-white/85">Approve</b>.
      </motion.p>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="my-5 w-full">
        <SwarmViz />
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={onSample}
        disabled={busy}
        className="sheen group relative inline-flex cursor-pointer items-center gap-3 overflow-hidden rounded-full bg-accent py-4 pl-6 pr-5 text-[17px] font-semibold text-ink shadow-[0_0_50px_-8px_rgba(212,255,58,0.7)] disabled:opacity-60"
      >
        <Zap className="h-5 w-5" fill="currentColor" />
        Run the sample brief
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink/10 transition group-hover:translate-x-0.5">
          <ArrowRight className="h-4 w-4" />
        </span>
      </motion.button>
      <div className="mt-4 flex items-center gap-2 text-[14px] text-white/40">
        <MessageCircle className="h-4 w-4" /> or @mention Haggle in #event-planning with your own brief
      </div>
      </div>
    </div>
  );
}
