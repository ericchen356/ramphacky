// End-to-end CLI demo of the Haggle swarm.
// Usage: npx tsx --env-file=.env.local scripts/demo.ts "brief text"
import { subscribe } from "../lib/store";
import { approveRun, startRun } from "../lib/agents/orchestrator";
import type { Run } from "../lib/types";

const DEFAULT_BRIEF =
  "Planning our Q4 sales offsite in NYC on Oct 20 for 120 people, budget $45k. 20 vegetarian, 6 gluten-free, 2 nut allergies. Need venue, catering and AV.";
const TIMEOUT_MS = 4 * 60 * 1000;

const brief = process.argv.slice(2).join(" ").trim() || DEFAULT_BRIEF;
const t0 = Date.now();
const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s]`;
const usd = (n?: number) => (typeof n === "number" ? `$${Math.round(n).toLocaleString("en-US")}` : "—");

let runId: string | undefined;
let lastStatus = "";
let logSeen = 0;
let chatSeen = 0;
const negSeen = new Map<string, string>();
let approving = false;
let resolveDone!: (r: Run) => void;
let rejectDone!: (e: unknown) => void;
const done = new Promise<Run>((res, rej) => {
  resolveDone = res;
  rejectDone = rej;
});

function onSnapshot(run: Run) {
  if (run.id !== runId) return;
  if (run.status !== lastStatus) {
    lastStatus = run.status;
    console.log(`${ts()} ━━ STATUS → ${run.status.toUpperCase()}`);
  }
  for (; logSeen < run.log.length; logSeen++) console.log(`${ts()} 🧠 ${run.log[logSeen].text}`);
  for (; chatSeen < run.chat.length; chatSeen++) {
    const m = run.chat[chatSeen];
    const who = m.from === "bot" ? "📱 BOT" : "👤 USER";
    console.log(`${ts()} ${who}:\n    ${m.text.replace(/\n/g, "\n    ")}`);
  }
  for (const n of run.negotiations) {
    const key = `${n.status}`;
    if (negSeen.get(n.id) === key) continue;
    negSeen.set(n.id, key);
    if (n.status === "deal")
      console.log(`${ts()}   ✔ ${n.vendorEmoji} ${n.vendorName} [${n.category}] DEAL ${usd(n.finalPrice)} (opened ${usd(n.initialQuote)}, ${n.messages.length} msgs${n.perks.length ? `, perks: ${n.perks.join("; ")}` : ""})`);
    else if (n.status === "walked_away" || n.status === "disqualified")
      console.log(`${ts()}   ✘ ${n.vendorEmoji} ${n.vendorName} [${n.category}] ${n.status}: ${n.reason ?? ""}`);
    else console.log(`${ts()}   · ${n.vendorEmoji} ${n.vendorName} [${n.category}] ${n.status}`);
  }
  if (run.status === "failed") rejectDone(new Error(run.error ?? "run failed"));
  if (run.status === "awaiting_approval" && !approving) {
    approving = true;
    // Defer so we don't re-enter the store emitter synchronously.
    setTimeout(() => {
      console.log(`${ts()} ━━ Auto-approving…`);
      approveRun(run.id).then(resolveDone, rejectDone);
    }, 0);
  }
}

async function main() {
  const unsub = subscribe(onSnapshot);
  const timer = setTimeout(() => rejectDone(new Error("Timed out after 4 minutes")), TIMEOUT_MS);
  console.log(`${ts()} Brief: ${brief}`);
  const run = startRun(brief);
  runId = run.id;
  onSnapshot(run); // catch up on anything emitted before runId was known
  try {
    const final = await done;
    console.log(`\n${ts()} ━━ DONE (${final.status})`);
    if (final.totals)
      console.log(`Totals: initial ${usd(final.totals.initial)} → final ${usd(final.totals.final)} · saved ${usd(final.totals.savings)}`);
    for (const s of final.selections) {
      const n = final.negotiations.find((x) => x.id === s.negotiationId);
      console.log(`  ${s.category}: ${n?.vendorName} ${usd(n?.finalPrice)} — ${s.rationale}`);
    }
    console.log(`Cards (${final.cards.length}):`);
    for (const c of final.cards) console.log(`  💳 ${c.vendorName} [${c.category}] •••• ${c.last4} limit ${usd(c.limit)} (${c.status})`);
    const msgs = final.negotiations.reduce((s, n) => s + n.messages.length, 0);
    console.log(`Negotiation messages: ${msgs} · wall time ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    process.exitCode = 0;
  } catch (e) {
    console.error(`\n${ts()} ✖ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    unsub();
    setTimeout(() => process.exit(), 50);
  }
}

void main();
