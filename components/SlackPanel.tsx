"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AtSign, Bell, Bold, Hash, Headphones, Italic, Plus, SendHorizontal, Smile, Sparkles, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Run } from "@/lib/types";
import { SAMPLE_BRIEF } from "@/lib/mock-run";
import { clock, isActive } from "./format";
import Mrkdwn from "./Mrkdwn";

const APPROVE_RE = /^\s*(@haggle\s+)?(approve|yes|book it|👍)\s*$/i;

function Avatar({ from, small }: { from: ChatMessage["from"]; small?: boolean }) {
  const size = small ? "h-7 w-7 text-[14px]" : "h-9 w-9 text-[17px]";
  return from === "bot" ? (
    <div className={`${size} grid shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#eaff8f] to-[#b6e01e] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]`}>
      🤝
    </div>
  ) : (
    <div className={`${size} grid shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#4a8cff] to-[#7b5cff] font-bold text-white`}>
      <span className={small ? "text-[12px]" : "text-[15px]"}>JP</span>
    </div>
  );
}

function Message({
  m,
  reply,
  mention,
  children,
}: {
  m: ChatMessage;
  reply?: boolean;
  mention?: boolean;
  children?: React.ReactNode;
}) {
  const bot = m.from === "bot";
  const text = mention ? m.text.replace(/^@haggle\s*/i, "") : m.text;
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={`group flex gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.03] ${reply ? "" : ""}`}
    >
      <Avatar from={m.from} small={reply} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold text-white">{bot ? "Haggle" : "Jordan Park"}</span>
          {bot && (
            <span className="rounded-[3px] bg-white/[0.12] px-1 py-px text-[10px] font-bold uppercase tracking-wide text-white/70">
              App
            </span>
          )}
          <span className="text-[12px] text-white/40">{clock(m.ts)}</span>
        </div>
        <div className="mt-0.5 break-words text-[14.5px] leading-[1.46] text-[#d1d2d3]">
          {mention && (
            <span className="mr-1 rounded-[3px] bg-[#1d9bd1]/20 px-0.5 font-medium text-[#1d9bd1]">@Haggle</span>
          )}
          <Mrkdwn text={text} />
        </div>
        {children}
      </div>
    </motion.div>
  );
}

export default function SlackPanel({
  run,
  onSend,
  onApprove,
  onViewDetails,
  busy,
  error,
}: {
  run?: Run;
  onSend: (brief: string) => void;
  onApprove: () => void;
  onViewDetails: () => void;
  busy: boolean;
  error?: string | null;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const chat = run?.chat ?? [];
  const typing = !!run && (isActive(run.status) || busy);
  const awaiting = run?.status === "awaiting_approval";
  const canStart = !run || !isActive(run.status);
  const [parent, ...replies] = chat;
  const lastBotIdx = replies.map((m) => m.from).lastIndexOf("bot");

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.length, typing, awaiting]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    if (awaiting && APPROVE_RE.test(t)) onApprove();
    else onSend(t.replace(/^@haggle\s*/i, ""));
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden rounded-2xl bg-[#1a1d21] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
      {/* Workspace sliver */}
      <div className="flex w-[54px] shrink-0 flex-col items-center gap-3 bg-[#2a0f2c] py-3">
        <div className="mb-1 flex gap-1">
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} className="h-2 w-2 rounded-full" style={{ background: c }} />
          ))}
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[15px] font-black text-[#2a0f2c]">A</div>
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white">
          <Hash className="h-4 w-4" />
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-lg text-white/55">
          <Bell className="h-4 w-4" />
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-lg text-white/55">
          <AtSign className="h-4 w-4" />
        </div>
        <div className="mt-auto grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[#4a8cff] to-[#7b5cff] text-[12px] font-bold text-white ring-2 ring-[#2a0f2c]">
          JP
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Channel header */}
        <div className="flex h-[54px] shrink-0 items-center gap-2 border-b border-white/[0.08] px-4">
          <Hash className="h-[18px] w-[18px] text-white/80" strokeWidth={2.5} />
          <span className="text-[16px] font-bold text-white">event-planning</span>
          <div className="ml-auto flex items-center gap-2 text-white/50">
            <Headphones className="h-4 w-4" />
            <span className="flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[12px]">
              <Users className="h-3.5 w-3.5" /> 14
            </span>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {!parent && (
            <div className="px-2 pb-4 pt-2">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/[0.06] text-white/70">
                <Hash className="h-6 w-6" />
              </div>
              <div className="mt-3 text-[18px] font-bold text-white">#event-planning</div>
              <p className="mt-1 text-[14px] leading-snug text-white/50">
                Mention <span className="rounded-[3px] bg-[#1d9bd1]/20 px-0.5 text-[#1d9bd1]">@Haggle</span> with an event brief and a swarm of agents will negotiate every vendor for you.
              </p>
            </div>
          )}

          {parent && (
            <>
              <Message m={parent} mention={parent.from === "user"} />
              {(replies.length > 0 || typing) && (
                <div className="ml-[20px] border-l-2 border-white/[0.08] pl-1.5">
                  {replies.length > 0 && <div className="mb-0.5 mt-1 flex items-center gap-1.5 px-2 text-[12.5px] font-semibold text-[#1d9bd1]">
                    <span className="flex -space-x-1">
                      <span className="h-4 w-4 rounded-[4px] bg-gradient-to-br from-[#eaff8f] to-[#b6e01e] ring-1 ring-[#1a1d21]" />
                    </span>
                    {replies.length} {replies.length === 1 ? "reply" : "replies"}
                    <span className="font-normal text-white/35">· Thread</span>
                  </div>}
                  <AnimatePresence initial={false}>
                    {replies.map((m, i) => (
                      <Message key={m.id} m={m} reply>
                        {awaiting && i === lastBotIdx && (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.25 }}
                            className="mt-2.5 flex flex-col items-stretch gap-1.5 pr-2"
                          >
                            <button
                              onClick={onApprove}
                              disabled={busy}
                              className="pulse-ring relative flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[#007a5a] px-2 py-2 text-center text-[13px] leading-tight font-bold text-white transition hover:bg-[#148567] disabled:opacity-60"
                            >
                              ✅ Approve &amp; issue Ramp cards
                            </button>
                            <button
                              onClick={onViewDetails}
                              className="cursor-pointer whitespace-nowrap rounded-md border border-white/20 px-3 py-1.5 text-[13.5px] font-bold text-white/90 transition hover:bg-white/[0.06]"
                            >
                              View details
                            </button>
                          </motion.div>
                        )}
                      </Message>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}
        </div>

        {/* Typing + quick actions */}
        <div className="shrink-0 px-3">
          <div className="h-5 px-1 text-[12px] text-white/45">
            <AnimatePresence>
              {typing && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                  <span className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="typing-dot h-1 w-1 rounded-full bg-white/60" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </span>
                  <b className="text-white/70">Haggle</b> is negotiating…
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence initial={false}>
            {canStart && !draft && !awaiting && (
              <motion.button
                key="sample"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                onClick={() => submit(SAMPLE_BRIEF)}
                disabled={busy}
                className="mb-2 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-accent/30 bg-accent/[0.07] px-3 py-2.5 text-left text-[13.5px] text-white/80 transition hover:bg-accent/[0.13] disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-accent" />
                <span className="line-clamp-1 flex-1">
                  <b className="text-white">Use sample:</b> Q4 sales offsite · NYC · 120 ppl · $45k
                </span>
              </motion.button>
            )}
          </AnimatePresence>
          {error && <div className="mb-1.5 px-1 text-[12.5px] text-rose-300">{error}</div>}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
          className="mx-3 mb-3 shrink-0 rounded-lg border border-white/[0.18] bg-[#222529] focus-within:border-white/35"
        >
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-1.5 text-white/35">
            <Bold className="h-3.5 w-3.5" />
            <Italic className="h-3.5 w-3.5" />
            <AtSign className="h-3.5 w-3.5" />
            <Smile className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <Plus className="h-5 w-5 shrink-0 rounded-full bg-white/[0.08] p-0.5 text-white/60" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={awaiting ? "Reply APPROVE to book…" : "Message #event-planning"}
              aria-label="Message #event-planning"
              className="min-w-0 flex-1 bg-transparent py-1 text-[15px] text-white placeholder:text-white/35 focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={busy || !draft.trim()}
              className={`grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md transition ${
                draft.trim() ? "bg-[#007a5a] text-white hover:bg-[#148567]" : "text-white/30"
              }`}
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
